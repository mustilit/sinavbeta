/**
 * E-Sınıf ödev atama — sınav doğrulama/görünürlük, tarih, çoklu sınıf + effectiveStatus.
 */
jest.mock('../../../src/infrastructure/database/prisma', () => ({
  prisma: {
    schoolUser: { findFirst: jest.fn() },
    schoolExam: { findFirst: jest.fn() },
    classroom: { findMany: jest.fn() },
    schoolAssignment: { create: jest.fn() },
    $transaction: jest.fn(),
  },
}));
jest.mock('../../../src/common/tenant', () => ({ getDefaultTenantId: () => 'ten1' }));

import { CreateAssignmentUseCase, effectiveStatus } from '../../../src/application/use-cases/school/SchoolAssignmentUseCases';
import { prisma } from '../../../src/infrastructure/database/prisma';

const p = prisma as any;
const teacher = { id: 'su1', schoolId: 'sch1', schoolRole: 'TEACHER', branchId: null, departmentId: 'd1', classroomId: null };
const tomorrow = new Date(Date.now() + 86400000).toISOString();
const nextWeek = new Date(Date.now() + 7 * 86400000).toISOString();

function exam(over = {}) {
  return { id: 'ex1', title: 'Sınav', createdById: 'u1', departmentId: 'd1', poolVisibility: 'DEPARTMENT', questions: [{ id: 'q1' }], ...over };
}

describe('CreateAssignmentUseCase', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    p.schoolUser.findFirst.mockResolvedValue(teacher);
    p.schoolExam.findFirst.mockResolvedValue(exam());
    p.classroom.findMany.mockResolvedValue([{ id: 'c1' }, { id: 'c2' }]);
    p.schoolAssignment.create.mockImplementation(async ({ data }: any) => ({ id: `a-${data.classroomId}` }));
    p.$transaction.mockImplementation(async (ops: any[]) => Promise.all(ops));
  });

  it('sınav bulunamaz/arşivli → EXAM_NOT_FOUND', async () => {
    p.schoolExam.findFirst.mockResolvedValue(null);
    await expect(new CreateAssignmentUseCase().execute({ examId: 'x', classroomIds: ['c1'], availableFrom: tomorrow, dueDate: nextWeek }, 'u1')).rejects.toMatchObject({ code: 'EXAM_NOT_FOUND' });
  });
  it('başka zümrenin DEPARTMENT sınavı → FORBIDDEN', async () => {
    p.schoolExam.findFirst.mockResolvedValue(exam({ departmentId: 'dX', createdById: 'other', poolVisibility: 'DEPARTMENT' }));
    await expect(new CreateAssignmentUseCase().execute({ examId: 'ex1', classroomIds: ['c1'], availableFrom: tomorrow, dueDate: nextWeek }, 'u1')).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
  it('SCHOOL görünür sınav başka zümreden de atanabilir', async () => {
    p.schoolExam.findFirst.mockResolvedValue(exam({ departmentId: 'dX', createdById: 'other', poolVisibility: 'SCHOOL' }));
    p.classroom.findMany.mockResolvedValue([{ id: 'c1' }]);
    const r = await new CreateAssignmentUseCase().execute({ examId: 'ex1', classroomIds: ['c1'], availableFrom: tomorrow, dueDate: nextWeek }, 'u1');
    expect(r.created).toBe(1);
  });
  it('sorusuz sınav → EXAM_EMPTY', async () => {
    p.schoolExam.findFirst.mockResolvedValue(exam({ questions: [] }));
    await expect(new CreateAssignmentUseCase().execute({ examId: 'ex1', classroomIds: ['c1'], availableFrom: tomorrow, dueDate: nextWeek }, 'u1')).rejects.toMatchObject({ code: 'EXAM_EMPTY' });
  });
  it('son tarih başlangıçtan önce → INVALID_RANGE', async () => {
    await expect(new CreateAssignmentUseCase().execute({ examId: 'ex1', classroomIds: ['c1'], availableFrom: nextWeek, dueDate: tomorrow }, 'u1')).rejects.toMatchObject({ code: 'INVALID_RANGE' });
  });
  it('sınıf seçilmezse → NO_CLASSROOM', async () => {
    await expect(new CreateAssignmentUseCase().execute({ examId: 'ex1', classroomIds: [], availableFrom: tomorrow, dueDate: nextWeek }, 'u1')).rejects.toMatchObject({ code: 'NO_CLASSROOM' });
  });
  it('başarı: çoklu sınıf → sınıf başına bir ödev', async () => {
    const r = await new CreateAssignmentUseCase().execute({ examId: 'ex1', classroomIds: ['c1', 'c2'], availableFrom: tomorrow, dueDate: nextWeek }, 'u1');
    expect(r.created).toBe(2);
    expect(r.assignmentIds).toHaveLength(2);
  });
});

describe('effectiveStatus', () => {
  it('availableFrom gelmediyse SCHEDULED', () => {
    expect(effectiveStatus({ status: 'SCHEDULED', availableFrom: new Date(Date.now() + 1e6), dueDate: new Date(Date.now() + 2e6) })).toBe('SCHEDULED');
  });
  it('aralıktaysa ACTIVE', () => {
    expect(effectiveStatus({ status: 'SCHEDULED', availableFrom: new Date(Date.now() - 1e6), dueDate: new Date(Date.now() + 1e6) })).toBe('ACTIVE');
  });
  it('CLOSED kalır', () => {
    expect(effectiveStatus({ status: 'CLOSED', availableFrom: new Date(Date.now() - 1e6), dueDate: new Date(Date.now() + 1e6) })).toBe('CLOSED');
  });
});
