/**
 * SchoolExam use-case'leri — oluşturma yetki/zümre, soru kaydetme tür-bazlı
 * doğrulama (TEST şık kuralı, WRITTEN çözüm zorunlu), havuz görünürlüğü.
 */
jest.mock('../../../src/infrastructure/database/prisma', () => ({
  prisma: {
    schoolUser: { findFirst: jest.fn() },
    department: { findUnique: jest.fn() },
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

  it('öğretmen: zümre VEYA SCHOOL VEYA kendi filtresi uygulanır', async () => {
    p.schoolUser.findFirst.mockResolvedValue(teacherCtx);
    await new ListSchoolExamPoolUseCase().execute({}, 'u1');
    const where = p.schoolExam.findMany.mock.calls[0][0].where;
    expect(where.OR).toEqual(expect.arrayContaining([
      { departmentId: 'dept1' }, { poolVisibility: 'SCHOOL' }, { createdById: 'u1' },
    ]));
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
