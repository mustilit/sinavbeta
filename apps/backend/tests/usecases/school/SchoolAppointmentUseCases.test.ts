/**
 * E-Sınıf Randevu use-case'leri — uygunluk CRUD, rezervasyon kenar durumları,
 * durum geçiş matrisi, çifte rezervasyon (P2002 → SLOT_TAKEN) ve iptal kuralları.
 *
 * Bu özellik ilk sürümünde SIFIR testle deploy edilmişti; bu dosya kritik iş
 * kurallarını kilitler. prisma mock'lanır; resolveSchoolContext gerçek çalışıp
 * schoolUser.findFirst'ten ctx'i çözer (diğer okul testlerindeki desen).
 */
jest.mock('../../../src/infrastructure/database/prisma', () => ({
  prisma: {
    schoolUser: { findFirst: jest.fn(), findMany: jest.fn(async () => []) },
    schoolTeacherAvailability: { findMany: jest.fn(async () => []), findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
    schoolAppointment: { findFirst: jest.fn(), findMany: jest.fn(async () => []), create: jest.fn(), update: jest.fn(), count: jest.fn(async () => 0) },
    department: { findMany: jest.fn(async () => []) },
    user: { findMany: jest.fn(async () => []) },
    schoolNotification: { create: jest.fn(), createMany: jest.fn() },
    classroom: { findMany: jest.fn(async () => []) },
    $transaction: jest.fn(async (fn: any) => (typeof fn === 'function' ? fn(txClient) : Promise.all(fn))),
  },
}));

import {
  ListMyAvailabilityUseCase,
  SetAvailabilityUseCase,
  ListAppointmentTeachersUseCase,
  GetTeacherSlotsUseCase,
  BookAppointmentUseCase,
  ListMyAppointmentsUseCase,
  CancelMyAppointmentUseCase,
  ListTeacherAppointmentsUseCase,
  UpdateAppointmentStatusUseCase,
} from '../../../src/application/use-cases/school/SchoolAppointmentUseCases';
import { prisma } from '../../../src/infrastructure/database/prisma';

const p = prisma as any;
// $transaction'ın callback formuna geçirilen tx client — availability CRUD burada.
const txClient = {
  schoolTeacherAvailability: {
    findMany: jest.fn(async () => []),
    create: jest.fn(async () => ({ id: 'new' })),
    update: jest.fn(async () => ({})),
    delete: jest.fn(async () => ({})),
  },
};

const teacherCtx = { id: 'su-t', schoolId: 'sch1', schoolRole: 'TEACHER', branchId: null, departmentId: null, classroomId: null };
const studentCtx = { id: 'su-s', schoolId: 'sch1', schoolRole: 'STUDENT', branchId: 'b1', departmentId: null, classroomId: 'c1' };
const TEACHER_ID = 'teacher-user-1';
const STUDENT_ID = 'student-user-1';

/** Bugünden N gün sonrasının "YYYY-MM-DD" anahtarı (kaynaktaki futureDay ile aynı yerel hesap). */
function futureDateStr(daysAhead: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
/** Bir tarih anahtarının UTC haftagünü (kaynaktaki book path bununla karşılaştırır). */
function utcDayOf(dateStr: string): number {
  return new Date(`${dateStr}T00:00:00.000Z`).getUTCDay();
}

beforeEach(() => {
  jest.clearAllMocks();
  txClient.schoolTeacherAvailability.findMany.mockResolvedValue([]);
  txClient.schoolTeacherAvailability.create.mockResolvedValue({ id: 'new' });
  txClient.schoolTeacherAvailability.update.mockResolvedValue({});
  txClient.schoolTeacherAvailability.delete.mockResolvedValue({});
});

// ─────────────────────────── SetAvailabilityUseCase ───────────────────────────
describe('SetAvailabilityUseCase — doğrulama + replace semantiği', () => {
  beforeEach(() => p.schoolUser.findFirst.mockResolvedValue(teacherCtx));

  it('STUDENT çağırırsa → FORBIDDEN_SCHOOL_ROLE', async () => {
    p.schoolUser.findFirst.mockResolvedValue(studentCtx);
    await expect(new SetAvailabilityUseCase().execute({ slots: [] }, 'u')).rejects.toMatchObject({ code: 'FORBIDDEN_SCHOOL_ROLE' });
  });

  it('geçersiz saat formatı → INVALID_TIME', async () => {
    await expect(new SetAvailabilityUseCase().execute({ slots: [{ dayOfWeek: 1, startTime: '9:00', endTime: '10:00' }] }, 'u')).rejects.toMatchObject({ code: 'INVALID_TIME' });
  });

  it('başlangıç >= bitiş → INVALID_TIME_RANGE', async () => {
    await expect(new SetAvailabilityUseCase().execute({ slots: [{ dayOfWeek: 1, startTime: '10:00', endTime: '10:00' }] }, 'u')).rejects.toMatchObject({ code: 'INVALID_TIME_RANGE' });
  });

  it('geçersiz gün (7) → INVALID_DAY', async () => {
    await expect(new SetAvailabilityUseCase().execute({ slots: [{ dayOfWeek: 7, startTime: '09:00', endTime: '10:00' }] }, 'u')).rejects.toMatchObject({ code: 'INVALID_DAY' });
  });

  it('60 slottan fazla → TOO_MANY_SLOTS', async () => {
    const slots = Array.from({ length: 61 }, (_, i) => ({ dayOfWeek: 1, startTime: '09:00', endTime: '10:00' }));
    await expect(new SetAvailabilityUseCase().execute({ slots }, 'u')).rejects.toMatchObject({ code: 'TOO_MANY_SLOTS' });
  });

  it('aynı günde çakışan slotlar → OVERLAPPING_SLOTS', async () => {
    const slots = [
      { dayOfWeek: 1, startTime: '09:00', endTime: '10:00' },
      { dayOfWeek: 1, startTime: '09:30', endTime: '10:30' },
    ];
    await expect(new SetAvailabilityUseCase().execute({ slots }, 'u')).rejects.toMatchObject({ code: 'OVERLAPPING_SLOTS' });
  });

  it('yeni slot → create; sonuç ListMyAvailability ile döner', async () => {
    txClient.schoolTeacherAvailability.findMany.mockResolvedValue([]); // mevcut yok
    p.schoolTeacherAvailability.findMany.mockResolvedValue([{ id: 'a1', dayOfWeek: 1, startTime: '09:00', endTime: '10:00' }]);
    const r = await new SetAvailabilityUseCase().execute({ slots: [{ dayOfWeek: 1, startTime: '09:00', endTime: '10:00' }] }, TEACHER_ID);
    expect(txClient.schoolTeacherAvailability.create).toHaveBeenCalledTimes(1);
    expect(r.slots).toHaveLength(1);
  });

  it('kaldırılan slot randevusuzsa DELETE edilir', async () => {
    txClient.schoolTeacherAvailability.findMany.mockResolvedValue([
      { id: 'old', dayOfWeek: 3, startTime: '14:00', endTime: '15:00', isActive: true, _count: { appointments: 0 } },
    ]);
    p.schoolTeacherAvailability.findMany.mockResolvedValue([]);
    await new SetAvailabilityUseCase().execute({ slots: [] }, TEACHER_ID);
    expect(txClient.schoolTeacherAvailability.delete).toHaveBeenCalledWith({ where: { id: 'old' } });
    expect(txClient.schoolTeacherAvailability.update).not.toHaveBeenCalled();
  });

  it('kaldırılan slot randevuluysa DELETE değil pasife alınır (kayıt zinciri korunur)', async () => {
    txClient.schoolTeacherAvailability.findMany.mockResolvedValue([
      { id: 'old', dayOfWeek: 3, startTime: '14:00', endTime: '15:00', isActive: true, _count: { appointments: 2 } },
    ]);
    p.schoolTeacherAvailability.findMany.mockResolvedValue([]);
    await new SetAvailabilityUseCase().execute({ slots: [] }, TEACHER_ID);
    expect(txClient.schoolTeacherAvailability.delete).not.toHaveBeenCalled();
    expect(txClient.schoolTeacherAvailability.update).toHaveBeenCalledWith({ where: { id: 'old' }, data: { isActive: false } });
  });
});

// ─────────────────────────── BookAppointmentUseCase ───────────────────────────
describe('BookAppointmentUseCase — rezervasyon kuralları', () => {
  const dateStr = futureDateStr(7);
  const availability = { id: 'slot1', teacherUserId: TEACHER_ID, dayOfWeek: utcDayOf(dateStr), startTime: '09:00', endTime: '09:30' };

  beforeEach(() => {
    p.schoolUser.findFirst.mockResolvedValue(studentCtx);
    p.schoolTeacherAvailability.findFirst.mockResolvedValue(availability);
    p.schoolAppointment.count.mockResolvedValue(0);
    p.schoolAppointment.create.mockResolvedValue({ id: 'appt1', status: 'PENDING' });
    p.user.findMany.mockResolvedValue([{ id: STUDENT_ID, firstName: 'Ali', lastName: 'V', username: 'S1' }]);
  });

  it('başarı: PENDING randevu oluşturur + bildirim tetikler', async () => {
    const r = await new BookAppointmentUseCase().execute({ availabilityId: 'slot1', date: dateStr, appointmentType: 'ACADEMIC', notes: 'soru' }, STUDENT_ID);
    expect(r).toMatchObject({ id: 'appt1', status: 'PENDING', date: dateStr, startTime: '09:00' });
    expect(p.schoolAppointment.create).toHaveBeenCalledTimes(1);
  });

  it('geçersiz tarih formatı → INVALID_DATE', async () => {
    await expect(new BookAppointmentUseCase().execute({ availabilityId: 'slot1', date: '07-2026' }, STUDENT_ID)).rejects.toMatchObject({ code: 'INVALID_DATE' });
  });

  it('slot bulunamaz → SLOT_NOT_FOUND', async () => {
    p.schoolTeacherAvailability.findFirst.mockResolvedValue(null);
    await expect(new BookAppointmentUseCase().execute({ availabilityId: 'x', date: dateStr }, STUDENT_ID)).rejects.toMatchObject({ code: 'SLOT_NOT_FOUND' });
  });

  it('kendi slotuna randevu → OWN_SLOT', async () => {
    p.schoolTeacherAvailability.findFirst.mockResolvedValue({ ...availability, teacherUserId: STUDENT_ID });
    await expect(new BookAppointmentUseCase().execute({ availabilityId: 'slot1', date: dateStr }, STUDENT_ID)).rejects.toMatchObject({ code: 'OWN_SLOT' });
  });

  it('tarih slotun gününe uymaz → DAY_MISMATCH', async () => {
    p.schoolTeacherAvailability.findFirst.mockResolvedValue({ ...availability, dayOfWeek: (utcDayOf(dateStr) + 1) % 7 });
    await expect(new BookAppointmentUseCase().execute({ availabilityId: 'slot1', date: dateStr }, STUDENT_ID)).rejects.toMatchObject({ code: 'DAY_MISMATCH' });
  });

  it('geçmiş tarih → PAST_DATE', async () => {
    const past = futureDateStr(-1);
    p.schoolTeacherAvailability.findFirst.mockResolvedValue({ ...availability, dayOfWeek: utcDayOf(past) });
    await expect(new BookAppointmentUseCase().execute({ availabilityId: 'slot1', date: past }, STUDENT_ID)).rejects.toMatchObject({ code: 'PAST_DATE' });
  });

  it('30 günden uzak → TOO_FAR', async () => {
    const far = futureDateStr(35);
    p.schoolTeacherAvailability.findFirst.mockResolvedValue({ ...availability, dayOfWeek: utcDayOf(far) });
    await expect(new BookAppointmentUseCase().execute({ availabilityId: 'slot1', date: far }, STUDENT_ID)).rejects.toMatchObject({ code: 'TOO_FAR' });
  });

  it('aktif randevu kotası dolu (5) → TOO_MANY_APPOINTMENTS', async () => {
    p.schoolAppointment.count.mockResolvedValue(5);
    await expect(new BookAppointmentUseCase().execute({ availabilityId: 'slot1', date: dateStr }, STUDENT_ID)).rejects.toMatchObject({ code: 'TOO_MANY_APPOINTMENTS' });
  });

  it('çifte rezervasyon: Prisma P2002 → SLOT_TAKEN (409)', async () => {
    p.schoolAppointment.create.mockRejectedValue({ code: 'P2002' });
    await expect(new BookAppointmentUseCase().execute({ availabilityId: 'slot1', date: dateStr }, STUDENT_ID)).rejects.toMatchObject({ code: 'SLOT_TAKEN', status: 409 });
  });

  it('P2002 dışı hata → aynen fırlatılır (yutulmaz)', async () => {
    p.schoolAppointment.create.mockRejectedValue(new Error('DB_DOWN'));
    await expect(new BookAppointmentUseCase().execute({ availabilityId: 'slot1', date: dateStr }, STUDENT_ID)).rejects.toThrow('DB_DOWN');
  });
});

// ─────────────────── UpdateAppointmentStatusUseCase (durum matrisi) ───────────
describe('UpdateAppointmentStatusUseCase — durum geçiş matrisi', () => {
  beforeEach(() => {
    p.schoolUser.findFirst.mockResolvedValue(teacherCtx);
    p.schoolAppointment.update.mockResolvedValue({});
    p.user.findMany.mockResolvedValue([]);
  });

  it('randevu yok (veya başkasının) → APPOINTMENT_NOT_FOUND', async () => {
    p.schoolAppointment.findFirst.mockResolvedValue(null);
    await expect(new UpdateAppointmentStatusUseCase().execute('x', { status: 'CONFIRMED' }, TEACHER_ID)).rejects.toMatchObject({ code: 'APPOINTMENT_NOT_FOUND' });
  });

  it('PENDING → CONFIRMED izinli', async () => {
    p.schoolAppointment.findFirst.mockResolvedValue({ id: 'a1', status: 'PENDING', date: new Date(), startTime: '09:00', studentUserId: STUDENT_ID });
    const r = await new UpdateAppointmentStatusUseCase().execute('a1', { status: 'CONFIRMED' }, TEACHER_ID);
    expect(r).toEqual({ id: 'a1', status: 'CONFIRMED' });
  });

  it('CONFIRMED → COMPLETED izinli', async () => {
    p.schoolAppointment.findFirst.mockResolvedValue({ id: 'a1', status: 'CONFIRMED', date: new Date(), startTime: '09:00', studentUserId: STUDENT_ID });
    const r = await new UpdateAppointmentStatusUseCase().execute('a1', { status: 'COMPLETED' }, TEACHER_ID);
    expect(r).toEqual({ id: 'a1', status: 'COMPLETED' });
  });

  it('PENDING → COMPLETED geçersiz → INVALID_TRANSITION (409)', async () => {
    p.schoolAppointment.findFirst.mockResolvedValue({ id: 'a1', status: 'PENDING', date: new Date(), startTime: '09:00', studentUserId: STUDENT_ID });
    await expect(new UpdateAppointmentStatusUseCase().execute('a1', { status: 'COMPLETED' }, TEACHER_ID)).rejects.toMatchObject({ code: 'INVALID_TRANSITION', status: 409 });
  });

  it('CANCELLED üzerinden geçiş → INVALID_TRANSITION (terminal durum)', async () => {
    p.schoolAppointment.findFirst.mockResolvedValue({ id: 'a1', status: 'CANCELLED', date: new Date(), startTime: '09:00', studentUserId: STUDENT_ID });
    await expect(new UpdateAppointmentStatusUseCase().execute('a1', { status: 'CONFIRMED' }, TEACHER_ID)).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
  });
});

// ─────────────────────── CancelMyAppointmentUseCase ───────────────────────────
describe('CancelMyAppointmentUseCase — öğrenci iptali', () => {
  beforeEach(() => {
    p.schoolUser.findFirst.mockResolvedValue(studentCtx);
    p.schoolAppointment.update.mockResolvedValue({});
    p.user.findMany.mockResolvedValue([]);
  });

  it('randevu yok → APPOINTMENT_NOT_FOUND', async () => {
    p.schoolAppointment.findFirst.mockResolvedValue(null);
    await expect(new CancelMyAppointmentUseCase().execute('x', STUDENT_ID)).rejects.toMatchObject({ code: 'APPOINTMENT_NOT_FOUND' });
  });

  it('PENDING randevu iptal edilebilir', async () => {
    p.schoolAppointment.findFirst.mockResolvedValue({ id: 'a1', status: 'PENDING', date: new Date(), startTime: '09:00', teacherUserId: TEACHER_ID });
    const r = await new CancelMyAppointmentUseCase().execute('a1', STUDENT_ID);
    expect(r).toEqual({ ok: true });
    expect(p.schoolAppointment.update).toHaveBeenCalledWith({ where: { id: 'a1' }, data: { status: 'CANCELLED' } });
  });

  it('COMPLETED randevu iptal edilemez → NOT_CANCELLABLE (409)', async () => {
    p.schoolAppointment.findFirst.mockResolvedValue({ id: 'a1', status: 'COMPLETED', date: new Date(), startTime: '09:00', teacherUserId: TEACHER_ID });
    await expect(new CancelMyAppointmentUseCase().execute('a1', STUDENT_ID)).rejects.toMatchObject({ code: 'NOT_CANCELLABLE', status: 409 });
  });
});

// ─────────────────────── Liste + slot use-case'leri ───────────────────────────
describe('GetTeacherSlotsUseCase — mine ayrımı', () => {
  beforeEach(() => {
    p.schoolUser.findFirst.mockResolvedValue(studentCtx);
    p.user.findMany.mockResolvedValue([{ id: TEACHER_ID, firstName: 'Ada', lastName: 'H', username: 'T1' }]);
  });

  it('öğretmen bulunamaz → TEACHER_NOT_FOUND', async () => {
    p.schoolUser.findFirst.mockResolvedValueOnce(studentCtx).mockResolvedValueOnce(null); // ctx sonra teacher lookup null
    await expect(new GetTeacherSlotsUseCase().execute({ teacherUserId: 'x' }, STUDENT_ID)).rejects.toMatchObject({ code: 'TEACHER_NOT_FOUND' });
  });

  it('dolu slotta mine=true/false doğru ayrılır', async () => {
    // İki hafta içinde eşleşen bir gün seç
    const dateStr = futureDateStr(7);
    const dow = new Date(`${dateStr}T00:00:00.000Z`).getUTCDay();
    // Kaynak futureDay(i).dayOfWeek YEREL gün kullanır; testi yerel güne göre kur.
    const localDow = (() => { const d = new Date(); d.setDate(d.getDate() + 7); return d.getDay(); })();
    p.schoolUser.findFirst.mockResolvedValueOnce(studentCtx).mockResolvedValueOnce({ userId: TEACHER_ID });
    p.schoolTeacherAvailability.findMany.mockResolvedValue([{ id: 'slot1', dayOfWeek: localDow, startTime: '09:00', endTime: '09:30' }]);
    p.schoolAppointment.findMany.mockResolvedValue([
      { availabilityId: 'slot1', date: new Date(`${futureDateStr(7)}T00:00:00.000Z`), studentUserId: STUDENT_ID },
    ]);
    const r = await new GetTeacherSlotsUseCase().execute({ teacherUserId: TEACHER_ID, days: 8 }, STUDENT_ID);
    const allSlots = r.days.flatMap((d: any) => d.slots);
    const mineSlot = allSlots.find((s: any) => s.mine);
    expect(mineSlot).toBeTruthy();
    expect(mineSlot.booked).toBe(true);
  });
});

describe('ListTeacherAppointmentsUseCase — sayfalama + filtre', () => {
  beforeEach(() => {
    p.schoolUser.findFirst.mockResolvedValue(teacherCtx);
    p.schoolAppointment.count.mockResolvedValue(1);
    p.schoolAppointment.findMany.mockResolvedValue([
      { id: 'a1', studentUserId: STUDENT_ID, appointmentType: 'ACADEMIC', date: new Date('2026-07-09'), startTime: '09:00', endTime: '09:30', status: 'PENDING', notes: null, teacherNotes: null, createdAt: new Date() },
    ]);
    p.schoolUser.findMany.mockResolvedValue([{ userId: STUDENT_ID, classroomId: 'c1' }]);
    p.classroom.findMany.mockResolvedValue([{ id: 'c1', name: '5-A' }]);
  });

  it('öğrenci adı + sınıfı ile döner; total + page bilgisi', async () => {
    p.user.findMany.mockResolvedValue([{ id: STUDENT_ID, firstName: 'Ali', lastName: 'V', username: 'S1' }]);
    const r = await new ListTeacherAppointmentsUseCase().execute({ scope: 'all', page: 1, pageSize: 20 }, TEACHER_ID);
    expect(r.total).toBe(1);
    expect(r.items[0]).toMatchObject({ id: 'a1', studentName: 'Ali V', studentClassroom: '5-A', status: 'PENDING' });
  });
});
