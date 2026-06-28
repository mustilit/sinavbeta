/**
 * E-Sınıf SchoolExam — branch (dal) kapsamı.
 * canManage rolleri, CreateExam zümre/ders türetme + ?? savunmaları, TUNNEL snapshot
 * defaults, Update alan dalları, SaveQuestions ?? '', List BRANCH_ADMIN/boş kapsam, GetExam görünürlük.
 */
jest.mock('../../../src/infrastructure/database/prisma', () => ({
  prisma: {
    schoolUser: { findFirst: jest.fn() },
    schoolLevel: { findMany: jest.fn(async () => []) },
    department: { findFirst: jest.fn(), findUnique: jest.fn(), findMany: jest.fn(async () => []) },
    adminSettings: { findFirst: jest.fn(async () => null) },
    schoolExam: { create: jest.fn(async ({ data }: any) => ({ id: 'ex1', ...data })), findFirst: jest.fn(), findMany: jest.fn(async () => []), update: jest.fn(async ({ data }: any) => ({ id: 'e1', ...data })), delete: jest.fn(async () => ({})) },
    schoolQuestion: { deleteMany: jest.fn(), create: jest.fn() },
    schoolQuestionOption: { createMany: jest.fn() },
    $transaction: jest.fn(async (fn: any) => fn({
      schoolQuestion: { deleteMany: jest.fn(), create: jest.fn().mockResolvedValue({ id: 'q1' }) },
      schoolQuestionOption: { createMany: jest.fn() },
      schoolExam: { update: jest.fn() },
    })),
  },
}));
jest.mock('../../../src/common/tenant', () => ({ getDefaultTenantId: () => 'ten1' }));

import * as Exam from '../../../src/application/use-cases/school/SchoolExamUseCases';
import { prisma } from '../../../src/infrastructure/database/prisma';

const p = prisma as any;
const ctxOf = (over: any = {}) => ({ id: 'su0', schoolId: 'sch1', schoolRole: 'SCHOOL_ADMIN', branchId: null, departmentId: null, classroomId: null, ...over });

beforeEach(() => {
  jest.clearAllMocks();
  p.schoolUser.findFirst.mockResolvedValue(ctxOf());
  p.adminSettings.findFirst.mockResolvedValue(null);
});

describe('CreateSchoolExam — başlık + zümre/ders türetme + ?? savunmaları', () => {
  it('title undefined → TITLE_REQUIRED (?? "")', async () => {
    await expect(new Exam.CreateSchoolExamUseCase().execute({ examType: 'TEST' } as any, 'u0')).rejects.toMatchObject({ code: 'TITLE_REQUIRED' });
  });
  it('admin + departmentId + subject yok → d.subject türetilir', async () => {
    p.department.findFirst.mockResolvedValue({ id: 'd1', subject: 'Matematik' });
    const r = await new Exam.CreateSchoolExamUseCase().execute({ examType: 'TEST', title: 'S', departmentId: 'd1' }, 'u0');
    expect(r).toMatchObject({ subject: 'Matematik', departmentId: 'd1' });
  });
  it('admin + departmentId + d.subject null → "" → SUBJECT_REQUIRED', async () => {
    p.department.findFirst.mockResolvedValue({ id: 'd1', subject: null });
    await expect(new Exam.CreateSchoolExamUseCase().execute({ examType: 'TEST', title: 'S', departmentId: 'd1' }, 'u0')).rejects.toMatchObject({ code: 'SUBJECT_REQUIRED' });
  });
  it('admin + wantDept + subject → ders zümresine bağlanır (dept bulunamazsa null)', async () => {
    p.department.findFirst.mockResolvedValue(null); // subject eşleşen zümre yok → departmentId null
    const r = await new Exam.CreateSchoolExamUseCase().execute({ examType: 'TEST', title: 'S', subject: 'Fen' }, 'u0');
    expect(r.departmentId).toBeNull();
    expect(r.poolVisibility).toBe('SCHOOL'); // zümre yok → SCHOOL
  });
  it('admin + SCHOOL görünürlük + subject → zümresiz', async () => {
    const r = await new Exam.CreateSchoolExamUseCase().execute({ examType: 'TEST', title: 'S', subject: 'Fen', poolVisibility: 'SCHOOL' }, 'u0');
    expect(r.departmentId).toBeNull();
  });
  it('öğretmen zümresiz → NO_DEPARTMENT', async () => {
    p.schoolUser.findFirst.mockResolvedValue(ctxOf({ schoolRole: 'TEACHER', departmentId: null }));
    await expect(new Exam.CreateSchoolExamUseCase().execute({ examType: 'TEST', title: 'S' }, 'u0')).rejects.toMatchObject({ code: 'NO_DEPARTMENT' });
  });
  it('öğretmen + subject yok → zümreden türetir (dept null → "")', async () => {
    p.schoolUser.findFirst.mockResolvedValue(ctxOf({ schoolRole: 'TEACHER', departmentId: 'd1' }));
    p.department.findUnique.mockResolvedValue(null); // dept?.subject ?? "" → ""
    await expect(new Exam.CreateSchoolExamUseCase().execute({ examType: 'TEST', title: 'S' }, 'u0')).rejects.toMatchObject({ code: 'SUBJECT_REQUIRED' });
  });
  it('öğretmen + subject yok → zümre subject türetilir (başarı)', async () => {
    p.schoolUser.findFirst.mockResolvedValue(ctxOf({ schoolRole: 'TEACHER', departmentId: 'd1' }));
    p.department.findUnique.mockResolvedValue({ subject: 'Tarih' });
    const r = await new Exam.CreateSchoolExamUseCase().execute({ examType: 'TEST', title: 'S', gradeLevel: 5, durationMinutes: 40 }, 'u0');
    expect(r).toMatchObject({ subject: 'Tarih', gradeLevel: 5, durationMinutes: 40 });
  });
  it('gradeLevel geçersiz → INVALID_GRADE', async () => {
    p.department.findFirst.mockResolvedValue({ id: 'd1', subject: 'Mat' });
    await expect(new Exam.CreateSchoolExamUseCase().execute({ examType: 'TEST', title: 'S', departmentId: 'd1', gradeLevel: 99 }, 'u0')).rejects.toMatchObject({ code: 'INVALID_GRADE' });
  });
  it('TUNNEL + adminSettings null → varsayılan snapshot (7/10/10)', async () => {
    p.department.findFirst.mockResolvedValue({ id: 'd1', subject: 'Mat' });
    p.adminSettings.findFirst.mockResolvedValue(null);
    const r = await new Exam.CreateSchoolExamUseCase().execute({ examType: 'TUNNEL', title: 'T', departmentId: 'd1' }, 'u0');
    expect(r).toMatchObject({ layerCount: 7, optionsPerQuestion: 10, advanceStreak: 10 });
  });
  it('TUNNEL + adminSettings dolu → snapshot değerleri', async () => {
    p.department.findFirst.mockResolvedValue({ id: 'd1', subject: 'Mat' });
    p.adminSettings.findFirst.mockResolvedValue({ maxLayersPerTunnel: 4, tunnelOptionsPerQuestion: 6, tunnelAdvanceStreak: 3 });
    const r = await new Exam.CreateSchoolExamUseCase().execute({ examType: 'TUNNEL', title: 'T', departmentId: 'd1' }, 'u0');
    expect(r).toMatchObject({ layerCount: 4, optionsPerQuestion: 6, advanceStreak: 3 });
  });
  it('durationMinutes 0 → null (Max||null)', async () => {
    p.department.findFirst.mockResolvedValue({ id: 'd1', subject: 'Mat' });
    const r = await new Exam.CreateSchoolExamUseCase().execute({ examType: 'TEST', title: 'S', departmentId: 'd1', durationMinutes: 0 }, 'u0');
    expect(r.durationMinutes).toBeNull();
  });
  it('başlık 200 karakterden uzun → TITLE_TOO_LONG', async () => {
    await expect(new Exam.CreateSchoolExamUseCase().execute({ examType: 'TEST', title: 'x'.repeat(201) }, 'u0')).rejects.toMatchObject({ code: 'TITLE_TOO_LONG' });
  });
  it('admin + departmentId + SCHOOL görünürlük → zümre var ama visibility SCHOOL (74)', async () => {
    p.department.findFirst.mockResolvedValue({ id: 'd1', subject: 'Mat' });
    const r = await new Exam.CreateSchoolExamUseCase().execute({ examType: 'TEST', title: 'S', departmentId: 'd1', poolVisibility: 'SCHOOL' }, 'u0');
    expect(r).toMatchObject({ departmentId: 'd1', poolVisibility: 'SCHOOL' });
  });
});

describe('UpdateSchoolExam — alan dalları (gradeLevel null/değer, topic null, durationMinutes)', () => {
  beforeEach(() => { p.schoolExam.findFirst.mockResolvedValue({ id: 'e1', createdById: 'u0', departmentId: 'd1' }); });
  it('gradeLevel null → null; topic boş → null; durationMinutes null → null', async () => {
    await new Exam.UpdateSchoolExamUseCase().execute('e1', { gradeLevel: null as any, topic: '   ', durationMinutes: null as any }, 'u0');
    const data = p.schoolExam.update.mock.calls[0][0].data;
    expect(data).toMatchObject({ gradeLevel: null, topic: null, durationMinutes: null });
  });
  it('durationMinutes 0 → null (Max||null)', async () => {
    await new Exam.UpdateSchoolExamUseCase().execute('e1', { durationMinutes: 0 }, 'u0');
    expect(p.schoolExam.update.mock.calls[0][0].data.durationMinutes).toBeNull();
  });
  it('subject boş → undefined; topic null → null; poolVisibility DEPARTMENT', async () => {
    await new Exam.UpdateSchoolExamUseCase().execute('e1', { subject: '  ', topic: null as any, poolVisibility: 'DEPARTMENT' }, 'u0');
    const data = p.schoolExam.update.mock.calls[0][0].data;
    expect(data.subject).toBeUndefined();
    expect(data.topic).toBeNull();
    expect(data.poolVisibility).toBe('DEPARTMENT');
  });
});

describe('SaveSchoolExamQuestions — Array.isArray + ?? "" dalları', () => {
  beforeEach(() => { p.schoolExam.findFirst.mockResolvedValue({ id: 'ex1', createdById: 'u0', departmentId: 'd1', examType: 'TEST' }); });
  it('sınav yok → EXAM_NOT_FOUND', async () => {
    p.schoolExam.findFirst.mockResolvedValue(null);
    await expect(new Exam.SaveSchoolExamQuestionsUseCase().execute('exX', { questions: [] }, 'u0')).rejects.toMatchObject({ code: 'EXAM_NOT_FOUND' });
  });
  it('questions dizi değil → NO_QUESTIONS', async () => {
    await expect(new Exam.SaveSchoolExamQuestionsUseCase().execute('ex1', { questions: null } as any, 'u0')).rejects.toMatchObject({ code: 'NO_QUESTIONS' });
  });
  it('options undefined → TOO_FEW_OPTIONS (q.options ?? [])', async () => {
    await expect(new Exam.SaveSchoolExamQuestionsUseCase().execute('ex1', { questions: [{ content: 'S' }] }, 'u0')).rejects.toMatchObject({ code: 'TOO_FEW_OPTIONS' });
  });
  it('content/mediaUrl/option content undefined → "" ile kaydedilir', async () => {
    const r = await new Exam.SaveSchoolExamQuestionsUseCase().execute('ex1', { questions: [
      { mediaUrl: 'img.png', options: [{ mediaUrl: 'a.png', isCorrect: true }, { content: 'B' }] }, // content yok → görselle geçerli
    ] }, 'u0');
    expect(r).toMatchObject({ saved: 1 });
  });
});

describe('ListSchoolExamPool — BRANCH_ADMIN + boş kapsam', () => {
  it('BRANCH_ADMIN → department.branchId kapsamı', async () => {
    p.schoolUser.findFirst.mockResolvedValue(ctxOf({ schoolRole: 'BRANCH_ADMIN', branchId: 'b1' }));
    p.schoolLevel.findMany.mockResolvedValue([]);
    p.department.findMany.mockResolvedValue([]);
    p.schoolExam.findMany.mockResolvedValue([]);
    await new Exam.ListSchoolExamPoolUseCase().execute({}, 'u0');
    const where = p.schoolExam.findMany.mock.calls[0][0].where;
    expect(JSON.stringify(where.OR)).toContain('branchId');
  });
  it('non-manager kapsam yok → [] (or boş)', async () => {
    p.schoolUser.findFirst.mockResolvedValue(ctxOf({ schoolRole: 'TEACHER', departmentId: null }));
    p.schoolLevel.findMany.mockResolvedValue([]);
    p.department.findMany.mockResolvedValue([]);
    const r = await new Exam.ListSchoolExamPoolUseCase().execute({}, 'uT');
    expect(r).toEqual([]);
  });
  it('satır eşleme: department/createdBy null → null (278/279)', async () => {
    p.schoolExam.findMany.mockResolvedValue([
      { id: 'e1', title: 'S', examType: 'TEST', subject: 'Mat', gradeLevel: null, topic: null, durationMinutes: null, totalPoints: 0, _count: { questions: 0 }, poolVisibility: 'SCHOOL', isArchived: false, department: null, createdBy: null, createdAt: new Date() },
    ]);
    const r = await new Exam.ListSchoolExamPoolUseCase().execute({}, 'u0'); // admin
    expect(r[0]).toMatchObject({ departmentName: null, createdByUsername: null });
  });
});

describe('Archive/Delete — not-found + forbidden', () => {
  it('Archive: sınav yok → EXAM_NOT_FOUND', async () => {
    p.schoolExam.findFirst.mockResolvedValue(null);
    await expect(new Exam.ArchiveSchoolExamUseCase().execute('exX', { isArchived: true }, 'u0')).rejects.toMatchObject({ code: 'EXAM_NOT_FOUND' });
  });
  it('Archive: yetkisiz → FORBIDDEN', async () => {
    p.schoolUser.findFirst.mockResolvedValue(ctxOf({ schoolRole: 'TEACHER', departmentId: 'd2' }));
    p.schoolExam.findFirst.mockResolvedValue({ id: 'e1', createdById: 'other', departmentId: 'd1' });
    await expect(new Exam.ArchiveSchoolExamUseCase().execute('e1', { isArchived: true }, 'uT')).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
  it('Delete: sınav yok → EXAM_NOT_FOUND', async () => {
    p.schoolExam.findFirst.mockResolvedValue(null);
    await expect(new Exam.DeleteSchoolExamUseCase().execute('exX', 'u0')).rejects.toMatchObject({ code: 'EXAM_NOT_FOUND' });
  });
});

describe('GetSchoolExam — görünürlük + canManage (DEPT_HEAD)', () => {
  const examRow = (over: any = {}) => ({ id: 'e1', createdById: 'other', departmentId: 'd1', poolVisibility: 'DEPARTMENT', questions: [], department: { name: 'Mat' }, createdBy: { username: 'x' }, ...over });
  it('DEPT_HEAD kendi zümresi → görünür + editable (canManage 20)', async () => {
    p.schoolUser.findFirst.mockResolvedValue(ctxOf({ schoolRole: 'DEPT_HEAD', departmentId: 'd1' }));
    p.schoolExam.findFirst.mockResolvedValue(examRow({ departmentId: 'd1' }));
    const r: any = await new Exam.GetSchoolExamUseCase().execute('e1', 'uH');
    expect(r.editable).toBe(true);
  });
  it('DEPT_HEAD başka zümre ama SCHOOL görünür → görünür, editable false', async () => {
    p.schoolUser.findFirst.mockResolvedValue(ctxOf({ schoolRole: 'DEPT_HEAD', departmentId: 'd2' }));
    p.schoolExam.findFirst.mockResolvedValue(examRow({ departmentId: 'd1', poolVisibility: 'SCHOOL' }));
    const r: any = await new Exam.GetSchoolExamUseCase().execute('e1', 'uH');
    expect(r.editable).toBe(false);
  });
  it('sahip (createdById) → görünür + editable', async () => {
    p.schoolUser.findFirst.mockResolvedValue(ctxOf({ schoolRole: 'TEACHER', departmentId: 'd2' }));
    p.schoolExam.findFirst.mockResolvedValue(examRow({ createdById: 'uOwner', departmentId: 'd1', poolVisibility: 'DEPARTMENT' }));
    const r: any = await new Exam.GetSchoolExamUseCase().execute('e1', 'uOwner');
    expect(r.editable).toBe(true);
  });
  it('erişimsiz öğretmen → FORBIDDEN', async () => {
    p.schoolUser.findFirst.mockResolvedValue(ctxOf({ schoolRole: 'TEACHER', departmentId: 'd2' }));
    p.schoolExam.findFirst.mockResolvedValue(examRow({ createdById: 'other', departmentId: 'd1', poolVisibility: 'DEPARTMENT' }));
    await expect(new Exam.GetSchoolExamUseCase().execute('e1', 'uT')).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
