/**
 * E-Sınıf Bildirim use-case'leri — okunmamış sayımı, cursor liste + filtre,
 * okundu işaretleme (idempotent), toplu okundu ve hiyerarşik mesaj gönderimi.
 *
 * İlk sürümde SIFIR testle deploy edilmişti (mesaj gönderme canlıda 429 hatası
 * verdi — ayrı bir throttler bug'ıydı). Bu dosya use-case iş kurallarını kilitler.
 * prisma mock'lanır; resolveSchoolContext + resolveSchoolScope gerçek çalışıp
 * mock'lanmış prisma'dan besler (SCHOOL_ADMIN → wholeSchool kapsam).
 */
jest.mock('../../../src/infrastructure/database/prisma', () => ({
  prisma: {
    schoolUser: { findFirst: jest.fn(), findUnique: jest.fn(), findMany: jest.fn(async () => []) },
    schoolLevel: { findMany: jest.fn(async () => []) },
    classroom: { findMany: jest.fn(async () => []) },
    department: { findMany: jest.fn(async () => []) },
    schoolNotification: {
      findMany: jest.fn(async () => []),
      count: jest.fn(async () => 0),
      findFirst: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(async () => ({ count: 0 })),
      create: jest.fn(),
      createMany: jest.fn(),
    },
  },
}));

import {
  GetUnreadCountUseCase,
  ListNotificationsUseCase,
  MarkReadUseCase,
  MarkAllReadUseCase,
  SendMessageUseCase,
  ListMessageTargetsUseCase,
  notifyNewAssignment,
} from '../../../src/application/use-cases/school/SchoolNotificationUseCases';
import { prisma } from '../../../src/infrastructure/database/prisma';

const p = prisma as any;
const STUDENT = 'stu-user-1';
const ADMIN = 'admin-user-1';
const studentCtx = { id: 'su-s', schoolId: 'sch1', schoolRole: 'STUDENT', branchId: null, departmentId: null, classroomId: 'c1' };
const adminCtx = { id: 'su-a', schoolId: 'sch1', schoolRole: 'SCHOOL_ADMIN', branchId: null, departmentId: null, classroomId: null };

beforeEach(() => jest.clearAllMocks());

// ─────────────────────────── GetUnreadCountUseCase ────────────────────────────
describe('GetUnreadCountUseCase', () => {
  it('okunmamış sayısını döner', async () => {
    p.schoolUser.findFirst.mockResolvedValue(studentCtx);
    p.schoolNotification.count.mockResolvedValue(4);
    const r = await new GetUnreadCountUseCase().execute(STUDENT);
    expect(r).toEqual({ unreadCount: 4 });
    expect(p.schoolNotification.count).toHaveBeenCalledWith({ where: { recipientId: STUDENT, schoolId: 'sch1', isRead: false } });
  });
});

// ─────────────────────────── ListNotificationsUseCase ─────────────────────────
describe('ListNotificationsUseCase — cursor + filtre + unreadCount', () => {
  beforeEach(() => p.schoolUser.findFirst.mockResolvedValue(studentCtx));

  it('limit kadar dönerse nextCursor null; unreadCount ayrı sorgudan', async () => {
    p.schoolNotification.findMany.mockResolvedValue([
      { id: 'n1', type: 'MESSAGE', title: 'a', isRead: false },
      { id: 'n2', type: 'MESSAGE', title: 'b', isRead: false },
    ]);
    p.schoolNotification.count.mockResolvedValue(2);
    const r = await new ListNotificationsUseCase().execute({ limit: 5 }, STUDENT);
    expect(r.items).toHaveLength(2);
    expect(r.nextCursor).toBeNull();
    expect(r.unreadCount).toBe(2);
  });

  it('limit+1 satır dönerse hasMore → sonuncu düşürülür, nextCursor set edilir', async () => {
    p.schoolNotification.findMany.mockResolvedValue([{ id: 'n1' }, { id: 'n2' }, { id: 'n3' }]);
    const r = await new ListNotificationsUseCase().execute({ limit: 2 }, STUDENT);
    expect(r.items).toHaveLength(2);
    expect(r.nextCursor).toBe('n2');
  });

  it('isRead + type filtresi where\'e yansır', async () => {
    p.schoolNotification.findMany.mockResolvedValue([]);
    await new ListNotificationsUseCase().execute({ isRead: false, type: 'NEW_ASSIGNMENT' }, STUDENT);
    const where = p.schoolNotification.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ recipientId: STUDENT, isRead: false, type: 'NEW_ASSIGNMENT' });
  });

  it('cursor verilince skip:1 + cursor eklenir', async () => {
    p.schoolNotification.findMany.mockResolvedValue([]);
    await new ListNotificationsUseCase().execute({ cursor: 'nX' }, STUDENT);
    const arg = p.schoolNotification.findMany.mock.calls[0][0];
    expect(arg.cursor).toEqual({ id: 'nX' });
    expect(arg.skip).toBe(1);
  });
});

// ─────────────────────────── MarkReadUseCase ──────────────────────────────────
describe('MarkReadUseCase — idempotent okundu', () => {
  beforeEach(() => p.schoolUser.findFirst.mockResolvedValue(studentCtx));

  it('başkasının / olmayan bildirim → NOTIFICATION_NOT_FOUND', async () => {
    p.schoolNotification.findFirst.mockResolvedValue(null);
    await expect(new MarkReadUseCase().execute('x', STUDENT)).rejects.toMatchObject({ code: 'NOTIFICATION_NOT_FOUND' });
  });

  it('okunmamışsa update edilir', async () => {
    p.schoolNotification.findFirst.mockResolvedValue({ id: 'n1', isRead: false });
    p.schoolNotification.update.mockResolvedValue({});
    const r = await new MarkReadUseCase().execute('n1', STUDENT);
    expect(r).toEqual({ ok: true });
    expect(p.schoolNotification.update).toHaveBeenCalledTimes(1);
  });

  it('zaten okunmuşsa update ATLANIR (idempotent)', async () => {
    p.schoolNotification.findFirst.mockResolvedValue({ id: 'n1', isRead: true });
    const r = await new MarkReadUseCase().execute('n1', STUDENT);
    expect(r).toEqual({ ok: true });
    expect(p.schoolNotification.update).not.toHaveBeenCalled();
  });
});

// ─────────────────────────── MarkAllReadUseCase ───────────────────────────────
describe('MarkAllReadUseCase', () => {
  it('okunmamışları toplu günceller, sayıyı döner', async () => {
    p.schoolUser.findFirst.mockResolvedValue(studentCtx);
    p.schoolNotification.updateMany.mockResolvedValue({ count: 7 });
    const r = await new MarkAllReadUseCase().execute(STUDENT);
    expect(r).toEqual({ updated: 7 });
  });
});

// ─────────────────────────── SendMessageUseCase ───────────────────────────────
describe('SendMessageUseCase — hiyerarşik mesaj', () => {
  beforeEach(() => {
    // resolveSchoolContext + resolveSchoolScope aynı findFirst'ü kullanır;
    // scope için ayrıca findUnique çağrılır (admin → blok atlanır).
    p.schoolUser.findFirst.mockResolvedValue(adminCtx);
    p.schoolUser.findUnique.mockResolvedValue({ userId: ADMIN, departmentId: null });
  });

  it('STUDENT çağırırsa → FORBIDDEN_SCHOOL_ROLE', async () => {
    p.schoolUser.findFirst.mockResolvedValue(studentCtx);
    p.schoolUser.findUnique.mockResolvedValue({ userId: STUDENT, departmentId: null });
    await expect(new SendMessageUseCase().execute({ title: 'x' }, STUDENT)).rejects.toMatchObject({ code: 'FORBIDDEN_SCHOOL_ROLE' });
  });

  it('başlık boşsa → TITLE_REQUIRED', async () => {
    await expect(new SendMessageUseCase().execute({ title: '   ' }, ADMIN)).rejects.toMatchObject({ code: 'TITLE_REQUIRED' });
  });

  it('classroomIds verilmiş ama kapsam dışıysa (valid boş) → NO_CLASSROOM', async () => {
    p.classroom.findMany.mockResolvedValue([]); // valid classroom yok
    await expect(new SendMessageUseCase().execute({ title: 'Duyuru', classroomIds: ['cX'] }, ADMIN)).rejects.toMatchObject({ code: 'NO_CLASSROOM' });
  });

  it('scope\'ta sınıf yoksa → NO_CLASSROOM', async () => {
    p.classroom.findMany.mockResolvedValue([]); // tüm kapsam boş
    await expect(new SendMessageUseCase().execute({ title: 'Duyuru' }, ADMIN)).rejects.toMatchObject({ code: 'NO_CLASSROOM' });
  });

  it('hedef sınıfta öğrenci yoksa → { sent: 0 } (hata değil)', async () => {
    p.classroom.findMany.mockResolvedValue([{ id: 'c1' }]);
    p.schoolUser.findMany.mockResolvedValue([]); // öğrenci yok
    const r = await new SendMessageUseCase().execute({ title: 'Duyuru' }, ADMIN);
    expect(r).toEqual({ sent: 0 });
  });

  it('başarı: benzersiz öğrencilere createMany ile bildirim + sent sayısı', async () => {
    p.classroom.findMany.mockResolvedValue([{ id: 'c1' }]);
    p.schoolUser.findMany.mockResolvedValue([{ userId: 'u1' }, { userId: 'u2' }, { userId: 'u1' }]); // tekilleştirme
    p.schoolNotification.createMany.mockResolvedValue({ count: 2 });
    const r = await new SendMessageUseCase().execute({ title: 'Duyuru', body: 'metin' }, ADMIN);
    expect(r).toEqual({ sent: 2 });
    expect(p.schoolNotification.createMany).toHaveBeenCalledTimes(1);
    const created = p.schoolNotification.createMany.mock.calls[0][0].data;
    expect(created).toHaveLength(2);
    expect(created[0]).toMatchObject({ type: 'MESSAGE', title: 'Duyuru', body: 'metin' });
  });
});

// ─────────────────────────── ListMessageTargetsUseCase ────────────────────────
describe('ListMessageTargetsUseCase', () => {
  it('kapsam içindeki sınıfları döner', async () => {
    p.schoolUser.findFirst.mockResolvedValue(adminCtx);
    p.schoolUser.findUnique.mockResolvedValue({ userId: ADMIN, departmentId: null });
    p.classroom.findMany.mockResolvedValue([{ id: 'c1', name: '5-A', gradeLevel: 5 }]);
    const r = await new ListMessageTargetsUseCase().execute(ADMIN);
    expect(r.classrooms).toEqual([{ id: 'c1', name: '5-A', gradeLevel: 5 }]);
  });
});

// ─────────────────── notify* best-effort (exception yutulmalı) ─────────────────
describe('notifyNewAssignment — best-effort (akışı bloklamaz)', () => {
  it('createMany hata fırlatsa bile PROPAGATE olmaz', async () => {
    p.schoolUser.findMany.mockResolvedValue([{ userId: 'u1' }]);
    p.schoolNotification.createMany.mockRejectedValue(new Error('DB'));
    await expect(notifyNewAssignment('sch1', 'a1', 'Ödev', 'c1', 'sender')).resolves.toBeUndefined();
  });

  it('sınıfta öğrenci yoksa createMany çağrılmaz', async () => {
    p.schoolUser.findMany.mockResolvedValue([]);
    await notifyNewAssignment('sch1', 'a1', 'Ödev', 'c1', 'sender');
    expect(p.schoolNotification.createMany).not.toHaveBeenCalled();
  });
});
