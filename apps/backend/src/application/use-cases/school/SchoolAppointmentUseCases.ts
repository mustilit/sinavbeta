/**
 * E-Sınıf — Randevu use-case'leri.
 * Öğretmen haftalık tekrar eden uygunluk slotları girer (gün + "HH:mm" aralığı);
 * öğrenci önümüzdeki günler için üretilen somut slotlardan randevu alır.
 * Çifte rezervasyon: DB partial unique index (availabilityId+date, aktif statüler) + P2002 → 409.
 */
import { prisma } from '../../../infrastructure/database/prisma';
import { AppError } from '../../errors/AppError';
import { logger } from '../../../infrastructure/logger/logger';
import { resolveSchoolContext, requireSchoolRole, schoolAudit } from './schoolHelpers';
import { notifyAppointmentEvent } from './SchoolNotificationUseCases';
import { recordSchoolAppointmentEvent } from '../../../infrastructure/metrics/metrics';

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const APPT_TYPES = ['ACADEMIC', 'COUNSELING', 'PARENT', 'OTHER'];
const TYPE_LABEL: Record<string, string> = {
  ACADEMIC: 'Akademik destek',
  COUNSELING: 'Rehberlik',
  PARENT: 'Veli görüşmesi',
  OTHER: 'Diğer',
};
const MAX_SLOTS = 60; // öğretmen başına haftalık slot üst sınırı
const MAX_HORIZON_DAYS = 30; // en fazla kaç gün ilerisi için rezervasyon
const MAX_ACTIVE_PER_STUDENT = 5; // öğrencinin aynı anda bekleyen/onaylı randevu sınırı

/** "YYYY-MM-DD" → UTC gece yarısı Date (DB'de tarih böyle saklanır). */
function parseDateKey(s: string): Date {
  return new Date(`${s}T00:00:00.000Z`);
}
/** Date → "YYYY-MM-DD" (UTC alanları — parseDateKey ile simetrik). */
function toDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}
/** Bugünden i gün sonrası için tarih anahtarı + haftanın günü (sunucu yerel saati). */
function futureDay(i: number): { key: string; dayOfWeek: number } {
  const d = new Date();
  d.setDate(d.getDate() + i);
  const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { key, dayOfWeek: d.getDay() };
}
function nowHHmm(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Kullanıcıların görünen adları (User.firstName lastName || username). */
async function displayNames(userIds: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(userIds)].filter(Boolean);
  if (!unique.length) return new Map();
  const rows = await prisma.user.findMany({
    where: { id: { in: unique } },
    select: { id: true, firstName: true, lastName: true, username: true },
  });
  return new Map(
    rows.map((r) => [r.id, `${r.firstName ?? ''} ${r.lastName ?? ''}`.trim() || r.username || r.id]),
  );
}

// ------------------------------------------------------------------
// Öğretmen: kendi haftalık uygunluk slotları
// ------------------------------------------------------------------
export class ListMyAvailabilityUseCase {
  async execute(actorId?: string) {
    const ctx = await resolveSchoolContext(actorId);
    requireSchoolRole(ctx, 'TEACHER', 'DEPT_HEAD');
    const slots = await prisma.schoolTeacherAvailability.findMany({
      where: { schoolId: ctx.schoolId, teacherUserId: actorId as string, isActive: true },
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
      select: { id: true, dayOfWeek: true, startTime: true, endTime: true },
    });
    return { slots };
  }
}

// ------------------------------------------------------------------
// Öğretmen: haftalık uygunluk setini kaydet (replace semantiği).
// Silinen slotta geçmiş randevu varsa satır silinmez, pasife alınır (kayıt zinciri korunur).
// ------------------------------------------------------------------
export class SetAvailabilityUseCase {
  async execute(input: { slots: Array<{ dayOfWeek: number; startTime: string; endTime: string }> }, actorId?: string) {
    const ctx = await resolveSchoolContext(actorId);
    requireSchoolRole(ctx, 'TEACHER', 'DEPT_HEAD');

    const slots = input.slots ?? [];
    if (slots.length > MAX_SLOTS) throw new AppError('TOO_MANY_SLOTS', `En fazla ${MAX_SLOTS} slot girilebilir`, 400);
    for (const s of slots) {
      if (!Number.isInteger(s.dayOfWeek) || s.dayOfWeek < 0 || s.dayOfWeek > 6) throw new AppError('INVALID_DAY', 'Geçersiz gün', 400);
      if (!TIME_RE.test(s.startTime) || !TIME_RE.test(s.endTime)) throw new AppError('INVALID_TIME', 'Saat biçimi HH:mm olmalı', 400);
      if (s.startTime >= s.endTime) throw new AppError('INVALID_TIME_RANGE', 'Bitiş saati başlangıçtan sonra olmalı', 400);
    }
    // Aynı gün içinde çakışma kontrolü
    const byDay = new Map<number, Array<{ startTime: string; endTime: string }>>();
    for (const s of slots) {
      const arr = byDay.get(s.dayOfWeek) ?? [];
      arr.push(s);
      byDay.set(s.dayOfWeek, arr);
    }
    for (const [, arr] of byDay) {
      const sorted = [...arr].sort((a, b) => a.startTime.localeCompare(b.startTime));
      for (let i = 1; i < sorted.length; i++) {
        if (sorted[i].startTime < sorted[i - 1].endTime) throw new AppError('OVERLAPPING_SLOTS', 'Aynı günde çakışan slotlar var', 400);
      }
    }

    const keyOf = (s: { dayOfWeek: number; startTime: string; endTime: string }) => `${s.dayOfWeek}|${s.startTime}|${s.endTime}`;
    const wantedKeys = new Set(slots.map(keyOf));

    await prisma.$transaction(async (tx) => {
      const existing = await tx.schoolTeacherAvailability.findMany({
        where: { schoolId: ctx.schoolId, teacherUserId: actorId as string },
        select: { id: true, dayOfWeek: true, startTime: true, endTime: true, isActive: true, _count: { select: { appointments: true } } },
      });
      const existingByKey = new Map(existing.map((e) => [keyOf(e), e]));

      // Yeni slotlar → oluştur; mevcut ama pasif → aktive et
      for (const key of wantedKeys) {
        const found = existingByKey.get(key);
        if (!found) {
          const [dayOfWeek, startTime, endTime] = key.split('|');
          await tx.schoolTeacherAvailability.create({
            data: { schoolId: ctx.schoolId, teacherUserId: actorId as string, dayOfWeek: Number(dayOfWeek), startTime, endTime },
          });
        } else if (!found.isActive) {
          await tx.schoolTeacherAvailability.update({ where: { id: found.id }, data: { isActive: true } });
        }
      }
      // Kaldırılan slotlar → randevusu varsa pasife al (cascade silmesin), yoksa sil
      for (const e of existing) {
        if (wantedKeys.has(keyOf(e))) continue;
        if (e._count.appointments > 0) {
          if (e.isActive) await tx.schoolTeacherAvailability.update({ where: { id: e.id }, data: { isActive: false } });
        } else {
          await tx.schoolTeacherAvailability.delete({ where: { id: e.id } });
        }
      }
    });

    logger.info('school.appointment.availability_set', { actorId, slotCount: slots.length });
    schoolAudit(ctx, {
      action: 'SCHOOL_AVAILABILITY_CHANGED',
      entityType: 'SchoolTeacherAvailability',
      entityId: actorId as string,
      metadata: { slotCount: slots.length },
    });
    return new ListMyAvailabilityUseCase().execute(actorId);
  }
}

// ------------------------------------------------------------------
// Öğrenci: randevu alınabilecek öğretmenler (aktif slotu olanlar)
// ------------------------------------------------------------------
export class ListAppointmentTeachersUseCase {
  async execute(actorId?: string) {
    const ctx = await resolveSchoolContext(actorId);
    requireSchoolRole(ctx, 'STUDENT');
    const avail = await prisma.schoolTeacherAvailability.findMany({
      where: { schoolId: ctx.schoolId, isActive: true },
      select: { teacherUserId: true },
      distinct: ['teacherUserId'],
    });
    const teacherIds = avail.map((a) => a.teacherUserId);
    if (!teacherIds.length) return { teachers: [] };
    const teachers = await prisma.schoolUser.findMany({
      where: { schoolId: ctx.schoolId, userId: { in: teacherIds }, isActive: true, schoolRole: { in: ['TEACHER', 'DEPT_HEAD'] as any } },
      select: { userId: true, departmentId: true },
    });
    const names = await displayNames(teachers.map((t) => t.userId));
    const deptIds = [...new Set(teachers.map((t) => t.departmentId).filter(Boolean))] as string[];
    const depts = deptIds.length
      ? await prisma.department.findMany({ where: { id: { in: deptIds } }, select: { id: true, subject: true } })
      : [];
    const subjectByDept = new Map(depts.map((d) => [d.id, d.subject]));
    return {
      teachers: teachers
        .map((t) => ({
          userId: t.userId,
          name: names.get(t.userId) ?? t.userId,
          subject: t.departmentId ? subjectByDept.get(t.departmentId) ?? null : null,
        }))
        .sort((a, b) => a.name.localeCompare(b.name, 'tr')),
    };
  }
}

// ------------------------------------------------------------------
// Öğrenci: bir öğretmenin önümüzdeki günlerdeki somut slotları
// ------------------------------------------------------------------
export class GetTeacherSlotsUseCase {
  async execute(input: { teacherUserId: string; days?: number }, actorId?: string) {
    const ctx = await resolveSchoolContext(actorId);
    requireSchoolRole(ctx, 'STUDENT');

    const teacher = await prisma.schoolUser.findFirst({
      where: { schoolId: ctx.schoolId, userId: input.teacherUserId, isActive: true, schoolRole: { in: ['TEACHER', 'DEPT_HEAD'] as any } },
      select: { userId: true },
    });
    if (!teacher) throw new AppError('TEACHER_NOT_FOUND', 'Öğretmen bulunamadı', 404);
    const teacherName = (await displayNames([teacher.userId])).get(teacher.userId) ?? teacher.userId;

    const horizon = Math.min(Math.max(Math.floor(input.days ?? 14), 1), MAX_HORIZON_DAYS);
    const availabilities = await prisma.schoolTeacherAvailability.findMany({
      where: { schoolId: ctx.schoolId, teacherUserId: input.teacherUserId, isActive: true },
      select: { id: true, dayOfWeek: true, startTime: true, endTime: true },
      orderBy: [{ startTime: 'asc' }],
    });
    if (!availabilities.length) return { teacherName, days: [] };

    const fromDate = parseDateKey(futureDay(0).key);
    const booked = await prisma.schoolAppointment.findMany({
      where: {
        availabilityId: { in: availabilities.map((a) => a.id) },
        date: { gte: fromDate },
        status: { in: ['PENDING', 'CONFIRMED'] as any },
      },
      select: { availabilityId: true, date: true, studentUserId: true },
    });
    const bookedMap = new Map(booked.map((b) => [`${b.availabilityId}|${toDateKey(b.date)}`, b.studentUserId]));

    const byDow = new Map<number, typeof availabilities>();
    for (const a of availabilities) {
      const arr = byDow.get(a.dayOfWeek) ?? [];
      arr.push(a);
      byDow.set(a.dayOfWeek, arr);
    }

    const days: Array<{ date: string; dayOfWeek: number; slots: Array<{ availabilityId: string; startTime: string; endTime: string; booked: boolean; mine: boolean }> }> = [];
    const nowTime = nowHHmm();
    for (let i = 0; i < horizon; i++) {
      const { key, dayOfWeek } = futureDay(i);
      const daySlots = byDow.get(dayOfWeek) ?? [];
      if (!daySlots.length) continue;
      const slots = daySlots
        .filter((s) => i > 0 || s.startTime > nowTime) // bugünün geçmiş saatleri gösterilmez
        .map((s) => {
          const holder = bookedMap.get(`${s.id}|${key}`);
          return { availabilityId: s.id, startTime: s.startTime, endTime: s.endTime, booked: !!holder, mine: holder === actorId };
        });
      if (slots.length) days.push({ date: key, dayOfWeek, slots });
    }
    return { teacherName, days };
  }
}

// ------------------------------------------------------------------
// Öğrenci: randevu al
// ------------------------------------------------------------------
export class BookAppointmentUseCase {
  async execute(
    input: { availabilityId: string; date: string; appointmentType?: string; notes?: string },
    actorId?: string,
  ) {
    const ctx = await resolveSchoolContext(actorId);
    requireSchoolRole(ctx, 'STUDENT');

    if (!DATE_RE.test(input.date ?? '')) throw new AppError('INVALID_DATE', 'Geçersiz tarih', 400);
    const type = APPT_TYPES.includes(input.appointmentType ?? '') ? input.appointmentType! : 'ACADEMIC';

    const availability = await prisma.schoolTeacherAvailability.findFirst({
      where: { id: input.availabilityId, schoolId: ctx.schoolId, isActive: true },
      select: { id: true, teacherUserId: true, dayOfWeek: true, startTime: true, endTime: true },
    });
    if (!availability) throw new AppError('SLOT_NOT_FOUND', 'Uygunluk slotu bulunamadı', 404);
    if (availability.teacherUserId === actorId) throw new AppError('OWN_SLOT', 'Kendi slotunuza randevu alamazsınız', 400);

    const date = parseDateKey(input.date);
    if (date.getUTCDay() !== availability.dayOfWeek) throw new AppError('DAY_MISMATCH', 'Tarih, slotun gününe uymuyor', 400);
    const todayKey = futureDay(0).key;
    if (input.date < todayKey) throw new AppError('PAST_DATE', 'Geçmiş tarihe randevu alınamaz', 400);
    if (input.date === todayKey && availability.startTime <= nowHHmm()) throw new AppError('PAST_TIME', 'Geçmiş saate randevu alınamaz', 400);
    if (input.date > futureDay(MAX_HORIZON_DAYS - 1).key) throw new AppError('TOO_FAR', `En fazla ${MAX_HORIZON_DAYS} gün sonrasına randevu alınabilir`, 400);

    const activeCount = await prisma.schoolAppointment.count({
      where: { schoolId: ctx.schoolId, studentUserId: actorId as string, status: { in: ['PENDING', 'CONFIRMED'] as any }, date: { gte: parseDateKey(todayKey) } },
    });
    if (activeCount >= MAX_ACTIVE_PER_STUDENT) throw new AppError('TOO_MANY_APPOINTMENTS', `En fazla ${MAX_ACTIVE_PER_STUDENT} aktif randevunuz olabilir`, 400);

    let appointment;
    try {
      appointment = await prisma.schoolAppointment.create({
        data: {
          schoolId: ctx.schoolId,
          availabilityId: availability.id,
          teacherUserId: availability.teacherUserId,
          studentUserId: actorId as string,
          appointmentType: type as any,
          date,
          startTime: availability.startTime,
          endTime: availability.endTime,
          notes: (input.notes ?? '').trim() || null,
        },
      });
    } catch (e: any) {
      if (e?.code === 'P2002') throw new AppError('SLOT_TAKEN', 'Bu saat az önce dolduruldu, başka bir slot seçin', 409);
      throw e;
    }

    const names = await displayNames([actorId as string]);
    void notifyAppointmentEvent(
      ctx.schoolId,
      appointment.id,
      availability.teacherUserId,
      actorId ?? null,
      `Yeni randevu talebi: ${input.date} ${availability.startTime}`,
      `${names.get(actorId as string) ?? 'Öğrenci'} — ${TYPE_LABEL[type]}${input.notes ? ` — ${(input.notes ?? '').trim()}` : ''}`,
    );
    logger.info('school.appointment.booked', { appointmentId: appointment.id, actorId, teacherUserId: availability.teacherUserId });
    schoolAudit(ctx, {
      action: 'SCHOOL_APPOINTMENT_BOOKED',
      entityType: 'SchoolAppointment',
      entityId: appointment.id,
      metadata: { teacherUserId: availability.teacherUserId, date: input.date, startTime: availability.startTime, appointmentType: type },
    });
    recordSchoolAppointmentEvent('booked');
    return { id: appointment.id, status: appointment.status, date: input.date, startTime: availability.startTime, endTime: availability.endTime };
  }
}

// ------------------------------------------------------------------
// Öğrenci: kendi randevuları
// ------------------------------------------------------------------
export class ListMyAppointmentsUseCase {
  async execute(actorId?: string) {
    const ctx = await resolveSchoolContext(actorId);
    requireSchoolRole(ctx, 'STUDENT');
    const rows = await prisma.schoolAppointment.findMany({
      where: { schoolId: ctx.schoolId, studentUserId: actorId as string },
      orderBy: [{ date: 'desc' }, { startTime: 'desc' }],
      take: 100,
      select: { id: true, teacherUserId: true, appointmentType: true, date: true, startTime: true, endTime: true, status: true, notes: true, teacherNotes: true, createdAt: true },
    });
    const names = await displayNames(rows.map((r) => r.teacherUserId));
    return {
      items: rows.map((r) => ({
        id: r.id,
        teacherName: names.get(r.teacherUserId) ?? null,
        appointmentType: r.appointmentType,
        date: toDateKey(r.date),
        startTime: r.startTime,
        endTime: r.endTime,
        status: r.status,
        notes: r.notes,
        teacherNotes: r.teacherNotes,
        createdAt: r.createdAt,
      })),
    };
  }
}

// ------------------------------------------------------------------
// Öğrenci: randevu iptali
// ------------------------------------------------------------------
export class CancelMyAppointmentUseCase {
  async execute(appointmentId: string, actorId?: string) {
    const ctx = await resolveSchoolContext(actorId);
    requireSchoolRole(ctx, 'STUDENT');
    const appt = await prisma.schoolAppointment.findFirst({
      where: { id: appointmentId, schoolId: ctx.schoolId, studentUserId: actorId as string },
      select: { id: true, status: true, date: true, startTime: true, teacherUserId: true },
    });
    if (!appt) throw new AppError('APPOINTMENT_NOT_FOUND', 'Randevu bulunamadı', 404);
    if (appt.status !== 'PENDING' && appt.status !== 'CONFIRMED') throw new AppError('NOT_CANCELLABLE', 'Bu randevu iptal edilemez', 409);
    await prisma.schoolAppointment.update({ where: { id: appt.id }, data: { status: 'CANCELLED' as any } });

    const names = await displayNames([actorId as string]);
    void notifyAppointmentEvent(
      ctx.schoolId,
      appt.id,
      appt.teacherUserId,
      actorId ?? null,
      `Randevu iptal edildi: ${toDateKey(appt.date)} ${appt.startTime}`,
      `${names.get(actorId as string) ?? 'Öğrenci'} randevusunu iptal etti`,
    );
    logger.info('school.appointment.cancelled_by_student', { appointmentId, actorId });
    schoolAudit(ctx, { action: 'SCHOOL_APPOINTMENT_CANCELLED', entityType: 'SchoolAppointment', entityId: appt.id, metadata: { by: 'student' } });
    recordSchoolAppointmentEvent('cancelled');
    return { ok: true };
  }
}

// ------------------------------------------------------------------
// Öğretmen: alınan randevular (sayfalı)
// ------------------------------------------------------------------
export class ListTeacherAppointmentsUseCase {
  async execute(
    input: { status?: string; scope?: 'upcoming' | 'all'; page?: number; pageSize?: number },
    actorId?: string,
  ) {
    const ctx = await resolveSchoolContext(actorId);
    requireSchoolRole(ctx, 'TEACHER', 'DEPT_HEAD');
    const page = Math.max(1, Math.floor(input.page ?? 1));
    const pageSize = Math.min(50, Math.max(1, Math.floor(input.pageSize ?? 20)));

    const where: Record<string, unknown> = { schoolId: ctx.schoolId, teacherUserId: actorId as string };
    if (input.status && ['PENDING', 'CONFIRMED', 'CANCELLED', 'COMPLETED'].includes(input.status)) where.status = input.status;
    if ((input.scope ?? 'upcoming') === 'upcoming') where.date = { gte: parseDateKey(futureDay(0).key) };

    const [total, rows] = await Promise.all([
      prisma.schoolAppointment.count({ where: where as any }),
      prisma.schoolAppointment.findMany({
        where: where as any,
        orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: { id: true, studentUserId: true, appointmentType: true, date: true, startTime: true, endTime: true, status: true, notes: true, teacherNotes: true, createdAt: true },
      }),
    ]);
    const students = await prisma.schoolUser.findMany({
      where: { schoolId: ctx.schoolId, userId: { in: rows.map((r) => r.studentUserId) } },
      select: { userId: true, classroomId: true },
    });
    const names = await displayNames(rows.map((r) => r.studentUserId));
    const classroomIds = [...new Set(students.map((s) => s.classroomId).filter(Boolean))] as string[];
    const classrooms = classroomIds.length
      ? await prisma.classroom.findMany({ where: { id: { in: classroomIds } }, select: { id: true, name: true } })
      : [];
    const classroomName = new Map(classrooms.map((c) => [c.id, c.name]));
    const studentByUid = new Map(students.map((s) => [s.userId, s]));

    return {
      items: rows.map((r) => {
        const s = studentByUid.get(r.studentUserId);
        return {
          id: r.id,
          studentName: names.get(r.studentUserId) ?? null,
          studentClassroom: s?.classroomId ? classroomName.get(s.classroomId) ?? null : null,
          appointmentType: r.appointmentType,
          date: toDateKey(r.date),
          startTime: r.startTime,
          endTime: r.endTime,
          status: r.status,
          notes: r.notes,
          teacherNotes: r.teacherNotes,
          createdAt: r.createdAt,
        };
      }),
      total,
      page,
      pageSize,
    };
  }
}

// ------------------------------------------------------------------
// Öğretmen: randevu durumu güncelle (onay / iptal / tamamlandı)
// ------------------------------------------------------------------
export class UpdateAppointmentStatusUseCase {
  async execute(
    appointmentId: string,
    input: { status: 'CONFIRMED' | 'CANCELLED' | 'COMPLETED'; teacherNotes?: string },
    actorId?: string,
  ) {
    const ctx = await resolveSchoolContext(actorId);
    requireSchoolRole(ctx, 'TEACHER', 'DEPT_HEAD');
    const appt = await prisma.schoolAppointment.findFirst({
      where: { id: appointmentId, schoolId: ctx.schoolId, teacherUserId: actorId as string },
      select: { id: true, status: true, date: true, startTime: true, studentUserId: true },
    });
    if (!appt) throw new AppError('APPOINTMENT_NOT_FOUND', 'Randevu bulunamadı', 404);

    const allowed: Record<string, string[]> = {
      PENDING: ['CONFIRMED', 'CANCELLED'],
      CONFIRMED: ['CANCELLED', 'COMPLETED'],
    };
    if (!(allowed[appt.status] ?? []).includes(input.status)) {
      throw new AppError('INVALID_TRANSITION', 'Bu durum geçişi yapılamaz', 409);
    }

    await prisma.schoolAppointment.update({
      where: { id: appt.id },
      data: { status: input.status as any, ...(input.teacherNotes !== undefined ? { teacherNotes: (input.teacherNotes ?? '').trim() || null } : {}) },
    });

    const when = `${toDateKey(appt.date)} ${appt.startTime}`;
    const titleByStatus: Record<string, string> = {
      CONFIRMED: `Randevunuz onaylandı: ${when}`,
      CANCELLED: `Randevunuz iptal edildi: ${when}`,
      COMPLETED: `Randevunuz tamamlandı: ${when}`,
    };
    void notifyAppointmentEvent(ctx.schoolId, appt.id, appt.studentUserId, actorId ?? null, titleByStatus[input.status], (input.teacherNotes ?? '').trim() || null);
    logger.info('school.appointment.status', { appointmentId, status: input.status, actorId });
    // COMPLETED için ayrı AuditAction yok — structured log yeterli (yukarıda).
    const auditAction = input.status === 'CONFIRMED' ? 'SCHOOL_APPOINTMENT_CONFIRMED' : input.status === 'CANCELLED' ? 'SCHOOL_APPOINTMENT_CANCELLED' : null;
    if (auditAction) {
      schoolAudit(ctx, { action: auditAction, entityType: 'SchoolAppointment', entityId: appt.id, metadata: { status: input.status } });
    }
    recordSchoolAppointmentEvent(input.status.toLowerCase() as 'confirmed' | 'cancelled' | 'completed');
    return { id: appt.id, status: input.status };
  }
}
