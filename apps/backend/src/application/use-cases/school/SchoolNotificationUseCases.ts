/**
 * E-Sınıf — Bildirim use-case'leri.
 * Yeni ödev / puanlandı / mesaj / sistem dışı ödev tamamlandı bildirimleri.
 * Hiyerarşik mesaj gönderimi: öğretmen → sınıf öğrencileri, yönetici → geniş kapsam.
 */
import { prisma } from '../../../infrastructure/database/prisma';
import { AppError } from '../../errors/AppError';
import { logger } from '../../../infrastructure/logger/logger';
import {
  resolveSchoolContext,
  requireSchoolRole,
  scopedClassroomWhere,
  resolveSchoolScope,
} from './schoolHelpers';
import { schoolAudit } from './schoolHelpers';
import { recordSchoolNotification } from '../../../infrastructure/metrics/metrics';

const LIMIT = 30;

// ------------------------------------------------------------------
// İç yardımcı: toplu bildirim yarat (en fazla 500'er batch)
// ------------------------------------------------------------------
async function createBulkNotifications(
  notifications: Array<{
    schoolId: string;
    recipientId: string;
    senderId?: string | null;
    type: string;
    title: string;
    body?: string | null;
    entityType?: string | null;
    entityId?: string | null;
    assignmentId?: string | null;
  }>,
) {
  const BATCH = 500;
  for (let i = 0; i < notifications.length; i += BATCH) {
    await prisma.schoolNotification.createMany({ data: notifications.slice(i, i + BATCH) as any });
  }
  if (notifications.length) recordSchoolNotification(notifications[0].type, notifications.length);
}

// ------------------------------------------------------------------
// Yeni ödev → sınıf öğrencilerine bildirim (assignment use-case'ten çağrılır)
// ------------------------------------------------------------------
export async function notifyNewAssignment(
  schoolId: string,
  assignmentId: string,
  title: string,
  classroomId: string,
  senderId: string,
) {
  try {
    const students = await prisma.schoolUser.findMany({
      where: { schoolId, classroomId, schoolRole: 'STUDENT' as any, isActive: true },
      select: { userId: true },
    });
    if (!students.length) return;
    await createBulkNotifications(
      students.map((s) => ({
        schoolId,
        recipientId: s.userId as string,
        senderId,
        type: 'NEW_ASSIGNMENT',
        title: `Yeni ödev: ${title}`,
        body: null,
        entityType: 'SchoolAssignment',
        entityId: assignmentId,
        assignmentId,
      })),
    );
    logger.info('school.notification.new_assignment', { assignmentId, studentCount: students.length });
  } catch (err: any) {
    logger.warn('school.notification.new_assignment.failed', { assignmentId, error: err?.message });
  }
}

// ------------------------------------------------------------------
// Ödev sonuçları yayımlandı → öğrenciye bildirim
// ------------------------------------------------------------------
export async function notifyAssignmentGraded(
  schoolId: string,
  assignmentId: string,
  title: string,
  studentUserId: string,
  senderId: string,
) {
  try {
    await prisma.schoolNotification.create({
      data: {
        schoolId,
        recipientId: studentUserId,
        senderId,
        type: 'ASSIGNMENT_GRADED' as any,
        title: `Ödev sonuçları açıklandı: ${title}`,
        entityType: 'SchoolAssignment',
        entityId: assignmentId,
        assignmentId,
      } as any,
    });
    recordSchoolNotification('ASSIGNMENT_GRADED');
  } catch (err: any) {
    logger.warn('school.notification.graded.failed', { assignmentId, studentUserId, error: err?.message });
  }
}

// ------------------------------------------------------------------
// Sistem dışı ödev tamamlandı → sınıf öğrencilerine bildirim
// ------------------------------------------------------------------
export async function notifyOfflineDone(
  schoolId: string,
  assignmentId: string,
  title: string,
  classroomId: string,
  senderId: string,
) {
  try {
    const students = await prisma.schoolUser.findMany({
      where: { schoolId, classroomId, schoolRole: 'STUDENT' as any, isActive: true },
      select: { userId: true },
    });
    if (!students.length) return;
    await createBulkNotifications(
      students.map((s) => ({
        schoolId,
        recipientId: s.userId as string,
        senderId,
        type: 'OFFLINE_DONE',
        title: `Ödev tamamlandı olarak işaretlendi: ${title}`,
        body: null,
        entityType: 'SchoolAssignment',
        entityId: assignmentId,
        assignmentId,
      })),
    );
    logger.info('school.notification.offline_done', { assignmentId, studentCount: students.length });
  } catch (err: any) {
    logger.warn('school.notification.offline_done.failed', { assignmentId, error: err?.message });
  }
}

// ------------------------------------------------------------------
// Ödev sonuçları yayımlandı → teslim eden öğrencilere toplu bildirim
// ------------------------------------------------------------------
export async function notifyResultsReleased(
  schoolId: string,
  assignmentId: string,
  title: string,
  studentUserIds: string[],
  senderId: string,
) {
  try {
    const unique = [...new Set(studentUserIds)].filter(Boolean);
    if (!unique.length) return;
    await createBulkNotifications(
      unique.map((uid) => ({
        schoolId,
        recipientId: uid,
        senderId,
        type: 'ASSIGNMENT_GRADED',
        title: `Ödev sonuçları açıklandı: ${title}`,
        body: null,
        entityType: 'SchoolAssignment',
        entityId: assignmentId,
        assignmentId,
      })),
    );
    logger.info('school.notification.results_released', { assignmentId, studentCount: unique.length });
  } catch (err: any) {
    logger.warn('school.notification.results_released.failed', { assignmentId, error: err?.message });
  }
}

// ------------------------------------------------------------------
// Randevu olayı → karşı tarafa bildirim (öğrenci↔öğretmen)
// ------------------------------------------------------------------
export async function notifyAppointmentEvent(
  schoolId: string,
  appointmentId: string,
  recipientUserId: string,
  senderId: string | null,
  title: string,
  body?: string | null,
) {
  try {
    await prisma.schoolNotification.create({
      data: {
        schoolId,
        recipientId: recipientUserId,
        senderId,
        type: 'APPOINTMENT' as any,
        title,
        body: body ?? null,
        entityType: 'SchoolAppointment',
        entityId: appointmentId,
      } as any,
    });
    recordSchoolNotification('APPOINTMENT');
  } catch (err: any) {
    logger.warn('school.notification.appointment.failed', { appointmentId, error: err?.message });
  }
}

// ------------------------------------------------------------------
// Okunmamış bildirim sayısı
// ------------------------------------------------------------------
export class GetUnreadCountUseCase {
  async execute(actorId?: string) {
    const ctx = await resolveSchoolContext(actorId);
    // Tüm okul rolleri bildirim alabilir
    const count = await prisma.schoolNotification.count({
      where: { recipientId: actorId as string, schoolId: ctx.schoolId, isRead: false },
    });
    return { unreadCount: count };
  }
}

// ------------------------------------------------------------------
// Bildirim listesi (cursor pagination)
// ------------------------------------------------------------------
export class ListNotificationsUseCase {
  async execute(
    input: { cursor?: string; limit?: number; isRead?: boolean; type?: string },
    actorId?: string,
  ) {
    const ctx = await resolveSchoolContext(actorId);
    const take = Math.min(Math.max(input.limit ?? LIMIT, 1), 100) + 1;

    const where: Record<string, unknown> = {
      recipientId: actorId as string,
      schoolId: ctx.schoolId,
    };
    if (input.isRead !== undefined) where.isRead = input.isRead;
    if (input.type) where.type = input.type;

    const rows = await prisma.schoolNotification.findMany({
      where: where as any,
      orderBy: { createdAt: 'desc' },
      take,
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
      select: {
        id: true, type: true, title: true, body: true,
        entityType: true, entityId: true, assignmentId: true,
        isRead: true, readAt: true, createdAt: true,
        sender: { select: { id: true, firstName: true, lastName: true, username: true } },
      },
    });

    const limit = Math.min(Math.max(input.limit ?? LIMIT, 1), 100);
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, -1) : rows;
    const nextCursor = hasMore ? items[items.length - 1]?.id ?? null : null;
    const unreadCount = await prisma.schoolNotification.count({
      where: { recipientId: actorId as string, schoolId: ctx.schoolId, isRead: false },
    });
    return { items, nextCursor, unreadCount };
  }
}

// ------------------------------------------------------------------
// Tek bildirimi okundu işaretle
// ------------------------------------------------------------------
export class MarkReadUseCase {
  async execute(notificationId: string, actorId?: string) {
    await resolveSchoolContext(actorId);
    const notif = await prisma.schoolNotification.findFirst({
      where: { id: notificationId, recipientId: actorId as string },
      select: { id: true, isRead: true },
    });
    if (!notif) throw new AppError('NOTIFICATION_NOT_FOUND', 'Bildirim bulunamadı', 404);
    if (notif.isRead) return { ok: true };
    await prisma.schoolNotification.update({
      where: { id: notificationId },
      data: { isRead: true, readAt: new Date() },
    });
    return { ok: true };
  }
}

// ------------------------------------------------------------------
// Tüm bildirimleri okundu işaretle
// ------------------------------------------------------------------
export class MarkAllReadUseCase {
  async execute(actorId?: string) {
    const ctx = await resolveSchoolContext(actorId);
    const result = await prisma.schoolNotification.updateMany({
      where: { recipientId: actorId as string, schoolId: ctx.schoolId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
    logger.info('school.notification.mark_all_read', { actorId, count: result.count });
    return { updated: result.count };
  }
}

// ------------------------------------------------------------------
// Mesaj gönder: öğretmen/yönetici → hiyerarşik kapsamdaki öğrenciler
// ------------------------------------------------------------------
export class SendMessageUseCase {
  async execute(
    input: { title: string; body?: string; classroomIds?: string[] },
    actorId?: string,
  ) {
    const ctx = await resolveSchoolContext(actorId);
    requireSchoolRole(ctx, 'TEACHER', 'DEPT_HEAD', 'SCHOOL_ADMIN', 'BRANCH_ADMIN');

    if (!input.title?.trim()) throw new AppError('TITLE_REQUIRED', 'Başlık zorunlu', 400);

    const scope = await resolveSchoolScope(actorId);
    const schoolId = ctx.schoolId;

    // Hedef sınıflar: açıkça verilenler varsa kontrol et, yoksa scope'a göre tüm kapsamı kullan
    let targetClassroomIds: string[] = [];

    if (input.classroomIds?.length) {
      const valid = await prisma.classroom.findMany({
        where: { AND: [{ id: { in: input.classroomIds }, schoolId }, scopedClassroomWhere(scope)] },
        select: { id: true },
      });
      targetClassroomIds = valid.map((c) => c.id);
      if (!targetClassroomIds.length) throw new AppError('NO_CLASSROOM', 'Yetkili sınıf bulunamadı', 404);
    } else {
      const allWhere: Record<string, unknown> = { schoolId, ...scopedClassroomWhere(scope) };
      const classrooms = await prisma.classroom.findMany({ where: allWhere as any, select: { id: true } });
      targetClassroomIds = classrooms.map((c) => c.id);
      if (!targetClassroomIds.length) throw new AppError('NO_CLASSROOM', 'Kapsamınızda sınıf yok', 404);
    }

    const students = await prisma.schoolUser.findMany({
      where: {
        schoolId,
        classroomId: { in: targetClassroomIds },
        schoolRole: 'STUDENT' as any,
        isActive: true,

      },
      select: { userId: true },
    });

    if (!students.length) return { sent: 0 };

    const uniqueIds = [...new Set(students.map((s) => s.userId as string))];

    await createBulkNotifications(
      uniqueIds.map((uid) => ({
        schoolId,
        recipientId: uid,
        senderId: actorId ?? null,
        type: 'MESSAGE',
        title: input.title.trim(),
        body: input.body?.trim() ?? null,
        entityType: null,
        entityId: null,
        assignmentId: null,
      })),
    );

    logger.info('school.notification.message_sent', { actorId, studentCount: uniqueIds.length, classroomCount: targetClassroomIds.length });
    schoolAudit(ctx, {
      action: 'SCHOOL_NOTIFICATION_SENT',
      entityType: 'SchoolNotification',
      entityId: schoolId,
      metadata: { studentCount: uniqueIds.length, classroomCount: targetClassroomIds.length },
    });

    return { sent: uniqueIds.length };
  }
}

// ------------------------------------------------------------------
// Mesaj hedef seçenekleri — kapsam içindeki sınıflar (compose formu için)
// ------------------------------------------------------------------
export class ListMessageTargetsUseCase {
  async execute(actorId?: string) {
    const ctx = await resolveSchoolContext(actorId);
    requireSchoolRole(ctx, 'TEACHER', 'DEPT_HEAD', 'SCHOOL_ADMIN', 'BRANCH_ADMIN');
    const scope = await resolveSchoolScope(actorId);
    const classrooms = await prisma.classroom.findMany({
      where: scopedClassroomWhere(scope) as any,
      select: { id: true, name: true, gradeLevel: true },
      orderBy: [{ gradeLevel: 'asc' }, { name: 'asc' }],
    });
    return { classrooms };
  }
}
