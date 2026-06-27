/**
 * SchoolExam use-case'leri — oluşturma yetki/zümre, soru kaydetme tür-bazlı
 * doğrulama (TEST şık kuralı, WRITTEN çözüm zorunlu), havuz görünürlüğü.
 */
jest.mock('../../../src/infrastructure/database/prisma', () => ({
  prisma: {
    schoolUser: { findFirst: jest.fn() },
    schoolLevel: { findMany: jest.fn(async () => []) },
    department: { findUnique: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(async () => []) },
    schoolExam: { create: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(), update: jest.fn(), delete: jest.fn() },
    schoolQuestion: { deleteMany: jest.fn(), create: jest.fn() },
    schoolQuestionOption: { createMany: jest.fn() },
    $transaction: jest.fn(),
  },
}));
jest.mock('../../../src/common/tenant', () => ({ getDefaultTenantId: () => 'ten1' }));

import {
  CreateSchoolExamUseCase,
  SaveSchoolExamQuestionsUseCase,
  ListSchoolExamPoolUseCase,
  UpdateSchoolExamUseCase,
  GetSchoolExamUseCase,
  ArchiveSchoolExamUseCase,
  DeleteSchoolExamUseCase,
} from '../../../src/application/use-cases/school/SchoolExamUseCases';
import { prisma } from '../../../src/infrastructure/database/prisma';

const p = prisma as any;
const teacherCtx = { id: 'su1', schoolId: 'sch1', schoolRole: 'TEACHER', branchId: null, departmentId: 'dept1', classroomId: null };

describe('CreateSchoolExamUseCase', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    p.schoolUser.findFirst.mockResolvedValue(teacherCtx);
    p.department.findUnique.mockResolvedValue({ subject: 'Matematik' });
    p.schoolExam.create.mockImplementation(async ({ data }: any) => ({ id: 'ex1', ...data }));
  });

  it('zümresi olmayan öğretmen → NO_DEPARTMENT', async () => {
    p.schoolUser.findFirst.mockResolvedValue({ ...teacherCtx, departmentId: null });
    await expect(new CreateSchoolExamUseCase().execute({ examType: 'TEST', title: 'Deneme' }, 'u1'))
      .rejects.toMatchObject({ code: 'NO_DEPARTMENT' });
  });

  it('geçersiz tür → INVALID_EXAM_TYPE', async () => {
    await expect(new CreateSchoolExamUseCase().execute({ examType: 'XX', title: 'Deneme' }, 'u1'))
      .rejects.toMatchObject({ code: 'INVALID_EXAM_TYPE' });
  });

  it('öğrenci oluşturamaz → FORBIDDEN_SCHOOL_ROLE', async () => {
    p.schoolUser.findFirst.mockResolvedValue({ ...teacherCtx, schoolRole: 'STUDENT' });
    await expect(new CreateSchoolExamUseCase().execute({ examType: 'TEST', title: 'X' }, 'u1'))
      .rejects.toMatchObject({ code: 'FORBIDDEN_SCHOOL_ROLE' });
  });

  it('başarı: ders zümreden türetilir, departmentId atanır', async () => {
    const r = await new CreateSchoolExamUseCase().execute({ examType: 'TUNNEL', title: '  Konu Testi  ' }, 'u1');
    expect(r.subject).toBe('Matematik');
    expect(r.departmentId).toBe('dept1');
    expect(r.examType).toBe('TUNNEL');
    expect(r.title).toBe('Konu Testi');
  });

  // ── Okul yöneticisi tam yetki ──
  const adminCtx = { id: 'sua', schoolId: 'sch1', schoolRole: 'SCHOOL_ADMIN', branchId: null, departmentId: null, classroomId: null };

  it('okul yöneticisi: zümresiz okul-geneli sınav oluşturur (subject zorunlu)', async () => {
    p.schoolUser.findFirst.mockResolvedValue(adminCtx);
    const r = await new CreateSchoolExamUseCase().execute({ examType: 'TEST', title: 'Genel Deneme', subject: 'Fen' }, 'ua');
    expect(r.departmentId).toBeNull();
    expect(r.subject).toBe('Fen');
    expect(r.poolVisibility).toBe('SCHOOL'); // zümre yoksa okul geneli
  });

  it('okul yöneticisi: subject vermezse SUBJECT_REQUIRED (türetilecek zümre yok)', async () => {
    p.schoolUser.findFirst.mockResolvedValue(adminCtx);
    await expect(new CreateSchoolExamUseCase().execute({ examType: 'TEST', title: 'X' }, 'ua'))
      .rejects.toMatchObject({ code: 'SUBJECT_REQUIRED' });
  });

  it('okul yöneticisi: departmentId verirse o zümreye atanır (ders türetilir)', async () => {
    p.schoolUser.findFirst.mockResolvedValue(adminCtx);
    p.department.findFirst.mockResolvedValue({ id: 'dept9', subject: 'Tarih' });
    const r = await new CreateSchoolExamUseCase().execute({ examType: 'TEST', title: 'Zümre Sınavı', departmentId: 'dept9' }, 'ua');
    expect(r.departmentId).toBe('dept9');
    expect(r.subject).toBe('Tarih');
  });

  it('okul yöneticisi: "Ders Zümresi" → seçilen derse ait zümreye bağlanır', async () => {
    p.schoolUser.findFirst.mockResolvedValue(adminCtx);
    p.department.findFirst.mockResolvedValue({ id: 'deptMat' }); // subject=Matematik eşleşmesi
    const r = await new CreateSchoolExamUseCase().execute({ examType: 'TEST', title: 'X', subject: 'Matematik', poolVisibility: 'DEPARTMENT' }, 'ua');
    expect(r.departmentId).toBe('deptMat');
    expect(r.poolVisibility).toBe('DEPARTMENT');
  });

  it('okul yöneticisi: "Tüm okul" → zümresiz (SCHOOL)', async () => {
    p.schoolUser.findFirst.mockResolvedValue(adminCtx);
    const r = await new CreateSchoolExamUseCase().execute({ examType: 'TEST', title: 'X', subject: 'Fen', poolVisibility: 'SCHOOL' }, 'ua');
    expect(r.departmentId).toBeNull();
    expect(r.poolVisibility).toBe('SCHOOL');
  });

  it('okul yöneticisi: geçersiz departmentId → DEPARTMENT_NOT_FOUND', async () => {
    p.schoolUser.findFirst.mockResolvedValue(adminCtx);
    p.department.findFirst.mockResolvedValue(null);
    await expect(new CreateSchoolExamUseCase().execute({ examType: 'TEST', title: 'X', subject: 'Fen', departmentId: 'yok' }, 'ua'))
      .rejects.toMatchObject({ code: 'DEPARTMENT_NOT_FOUND' });
  });
});

describe('Okul yöneticisi — başkasının sınavını yönetebilir', () => {
  const adminCtx = { id: 'sua', schoolId: 'sch1', schoolRole: 'SCHOOL_ADMIN', branchId: null, departmentId: null, classroomId: null };
  beforeEach(() => { jest.clearAllMocks(); p.schoolUser.findFirst.mockResolvedValue(adminCtx); });

  it('Update: başkasının sınavını günceller (canManage)', async () => {
    p.schoolExam.findFirst.mockResolvedValue({ id: 'e1', createdById: 'other', departmentId: 'dX' });
    p.schoolExam.update.mockResolvedValue({ id: 'e1', title: 'Y' });
    const r = await new UpdateSchoolExamUseCase().execute('e1', { title: 'Y' }, 'ua');
    expect(r.title).toBe('Y');
  });

  it('Archive: başkasının sınavını pasife alır', async () => {
    p.schoolExam.findFirst.mockResolvedValue({ id: 'e1', createdById: 'other', departmentId: 'dX' });
    p.schoolExam.update.mockResolvedValue({ id: 'e1', isArchived: true });
    const r = await new ArchiveSchoolExamUseCase().execute('e1', { isArchived: true }, 'ua');
    expect(r.isArchived).toBe(true);
  });

  it('Delete: başkasının sınavını siler', async () => {
    p.schoolExam.findFirst.mockResolvedValue({ id: 'e1', createdById: 'other', departmentId: 'dX' });
    p.schoolExam.delete.mockResolvedValue({ id: 'e1' });
    const r = await new DeleteSchoolExamUseCase().execute('e1', 'ua');
    expect(r).toBeTruthy();
  });

  it('Get: başkasının sınavı admin için editable (soru editörü açılır)', async () => {
    p.schoolExam.findFirst.mockResolvedValue({ id: 'e1', createdById: 'other', departmentId: 'dX', poolVisibility: 'DEPARTMENT', questions: [], department: null, createdBy: { username: 'x' } });
    const r = await new GetSchoolExamUseCase().execute('e1', 'ua');
    expect(r).toMatchObject({ canManage: true, editable: true });
  });
});

describe('SaveSchoolExamQuestionsUseCase', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    p.schoolUser.findFirst.mockResolvedValue(teacherCtx);
    p.$transaction.mockImplementation(async (fn: any) => fn({
      schoolQuestion: { deleteMany: jest.fn(), create: jest.fn().mockResolvedValue({ id: 'q1' }) },
      schoolQuestionOption: { createMany: jest.fn() },
      schoolExam: { update: jest.fn() },
    }));
  });

  it('TEST: tam 1 doğru şık değilse → ONE_CORRECT_REQUIRED', async () => {
    p.schoolExam.findFirst.mockResolvedValue({ id: 'ex1', createdById: 'u1', departmentId: 'dept1', examType: 'TEST' });
    await expect(new SaveSchoolExamQuestionsUseCase().execute('ex1', { questions: [
      { content: 'S1', options: [{ content: 'A', isCorrect: true }, { content: 'B', isCorrect: true }] },
    ] }, 'u1')).rejects.toMatchObject({ code: 'ONE_CORRECT_REQUIRED' });
  });

  it('TEST: 2 şıktan az → TOO_FEW_OPTIONS', async () => {
    p.schoolExam.findFirst.mockResolvedValue({ id: 'ex1', createdById: 'u1', departmentId: 'dept1', examType: 'TEST' });
    await expect(new SaveSchoolExamQuestionsUseCase().execute('ex1', { questions: [
      { content: 'S1', options: [{ content: 'A', isCorrect: true }] },
    ] }, 'u1')).rejects.toMatchObject({ code: 'TOO_FEW_OPTIONS' });
  });

  it('WRITTEN: çözüm yoksa → SOLUTION_REQUIRED', async () => {
    p.schoolExam.findFirst.mockResolvedValue({ id: 'ex1', createdById: 'u1', departmentId: 'dept1', examType: 'WRITTEN' });
    await expect(new SaveSchoolExamQuestionsUseCase().execute('ex1', { questions: [{ content: 'Açık uçlu' }] }, 'u1'))
      .rejects.toMatchObject({ code: 'SOLUTION_REQUIRED' });
  });

  it('başkasının sınavı (yetkisiz) → FORBIDDEN', async () => {
    p.schoolExam.findFirst.mockResolvedValue({ id: 'ex1', createdById: 'other', departmentId: 'deptX', examType: 'TEST' });
    await expect(new SaveSchoolExamQuestionsUseCase().execute('ex1', { questions: [{ content: 'S', options: [{ content: 'A', isCorrect: true }, { content: 'B' }] }] }, 'u1'))
      .rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('TEST başarı: totalPoints hesaplanır', async () => {
    p.schoolExam.findFirst.mockResolvedValue({ id: 'ex1', createdById: 'u1', departmentId: 'dept1', examType: 'TEST' });
    const r = await new SaveSchoolExamQuestionsUseCase().execute('ex1', { questions: [
      { content: 'S1', points: 2, options: [{ content: 'A', isCorrect: true }, { content: 'B' }] },
      { content: 'S2', points: 3, options: [{ content: 'A' }, { content: 'B', isCorrect: true }] },
    ] }, 'u1');
    expect(r).toEqual({ saved: 2, totalPoints: 5 });
  });
});

describe('ListSchoolExamPoolUseCase (görünürlük)', () => {
  beforeEach(() => { jest.clearAllMocks(); p.schoolExam.findMany.mockResolvedValue([]); });

  it('öğretmen (zümre üyesi): yalnız kendi zümresinin sınavları (departmentId)', async () => {
    p.schoolUser.findFirst.mockResolvedValue(teacherCtx); // departmentId: 'dept1'
    p.schoolLevel.findMany.mockResolvedValue([]);
    p.department.findMany.mockResolvedValue([]);
    await new ListSchoolExamPoolUseCase().execute({}, 'u1');
    const where = p.schoolExam.findMany.mock.calls[0][0].where;
    expect(where.OR).toEqual(expect.arrayContaining([{ departmentId: { in: ['dept1'] } }]));
  });

  it('seviye sorumlusu: kendi seviyesinin zümre sınavları (department.levelId)', async () => {
    p.schoolUser.findFirst.mockResolvedValue({ ...teacherCtx, departmentId: null });
    p.schoolLevel.findMany.mockResolvedValue([{ id: 'lv5' }]);
    p.department.findMany.mockResolvedValue([]);
    await new ListSchoolExamPoolUseCase().execute({}, 'u1');
    const where = p.schoolExam.findMany.mock.calls[0][0].where;
    expect(where.OR).toEqual(expect.arrayContaining([{ department: { levelId: { in: ['lv5'] } } }]));
  });

  it('okul yöneticisi: görünürlük filtresi YOK (tümü)', async () => {
    p.schoolUser.findFirst.mockResolvedValue({ ...teacherCtx, schoolRole: 'SCHOOL_ADMIN', departmentId: null });
    await new ListSchoolExamPoolUseCase().execute({}, 'u1');
    const where = p.schoolExam.findMany.mock.calls[0][0].where;
    expect(where.OR).toBeUndefined();
    expect(where.schoolId).toBe('sch1');
  });
});

describe('UpdateSchoolExamUseCase', () => {
  beforeEach(() => { jest.clearAllMocks(); p.schoolUser.findFirst.mockResolvedValue(teacherCtx); });
  it('sınav yoksa EXAM_NOT_FOUND', async () => {
    p.schoolExam.findFirst.mockResolvedValue(null);
    await expect(new UpdateSchoolExamUseCase().execute('x', { title: 'Y' }, 'u1')).rejects.toMatchObject({ code: 'EXAM_NOT_FOUND' });
  });
  it('yetki yoksa FORBIDDEN', async () => {
    p.schoolExam.findFirst.mockResolvedValue({ id: 'e1', createdById: 'other', departmentId: 'dX' });
    await expect(new UpdateSchoolExamUseCase().execute('e1', { title: 'Y' }, 'u1')).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
  it('başarı: başlık güncellenir', async () => {
    p.schoolExam.findFirst.mockResolvedValue({ id: 'e1', createdById: 'u1', departmentId: 'dept1' });
    p.schoolExam.update.mockResolvedValue({ id: 'e1', title: 'Yeni' });
    const r = await new UpdateSchoolExamUseCase().execute('e1', { title: 'Yeni', gradeLevel: 5 }, 'u1');
    expect(r.title).toBe('Yeni');
  });
});

describe('GetSchoolExamUseCase', () => {
  beforeEach(() => { jest.clearAllMocks(); p.schoolUser.findFirst.mockResolvedValue(teacherCtx); });
  it('sınav yoksa EXAM_NOT_FOUND', async () => {
    p.schoolExam.findFirst.mockResolvedValue(null);
    await expect(new GetSchoolExamUseCase().execute('x', 'u1')).rejects.toMatchObject({ code: 'EXAM_NOT_FOUND' });
  });
  it('erişim yoksa FORBIDDEN', async () => {
    p.schoolExam.findFirst.mockResolvedValue({ id: 'e1', createdById: 'other', departmentId: 'dX', poolVisibility: 'DEPARTMENT', questions: [], department: null, createdBy: { username: 'x' } });
    await expect(new GetSchoolExamUseCase().execute('e1', 'u1')).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
  it('kendi sınavı → döner (canManage/editable)', async () => {
    p.schoolExam.findFirst.mockResolvedValue({ id: 'e1', createdById: 'u1', departmentId: 'dept1', poolVisibility: 'DEPARTMENT', questions: [], department: { name: 'Mat' }, createdBy: { username: 'x' } });
    const r = await new GetSchoolExamUseCase().execute('e1', 'u1');
    expect(r).toMatchObject({ id: 'e1', canManage: true, editable: true });
  });
});

describe('Archive/Delete SchoolExam', () => {
  beforeEach(() => { jest.clearAllMocks(); p.schoolUser.findFirst.mockResolvedValue(teacherCtx); });
  it('Archive başarı', async () => {
    p.schoolExam.findFirst.mockResolvedValue({ id: 'e1', createdById: 'u1', departmentId: 'dept1' });
    p.schoolExam.update.mockResolvedValue({ id: 'e1', isArchived: true });
    const r = await new ArchiveSchoolExamUseCase().execute('e1', { isArchived: true }, 'u1');
    expect(r).toMatchObject({ id: 'e1', isArchived: true });
  });
  it('Delete: yetki yoksa FORBIDDEN', async () => {
    p.schoolExam.findFirst.mockResolvedValue({ id: 'e1', createdById: 'other', departmentId: 'dX' });
    await expect(new DeleteSchoolExamUseCase().execute('e1', 'u1')).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
  it('Delete başarı', async () => {
    p.schoolExam.findFirst.mockResolvedValue({ id: 'e1', createdById: 'u1', departmentId: 'dept1' });
    p.schoolExam.delete.mockResolvedValue({});
    const r = await new DeleteSchoolExamUseCase().execute('e1', 'u1');
    expect(r).toEqual({ ok: true });
  });
});
