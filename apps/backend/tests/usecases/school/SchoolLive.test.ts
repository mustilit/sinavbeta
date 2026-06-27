/**
 * Okul canlı sınavı — kota engeli + aynı-okul katılım kuralı + temel doğrulama.
 */
jest.mock('../../../src/infrastructure/database/prisma', () => ({
  prisma: {
    schoolUser: { findFirst: jest.fn() },
    schoolLevel: { findFirst: jest.fn(async () => null), findMany: jest.fn(async () => []) },
    classroom: { findFirst: jest.fn(async () => null), findMany: jest.fn(async () => []) },
    department: { findFirst: jest.fn(async () => null), findUnique: jest.fn(async () => null), findMany: jest.fn(async () => []) },
    school: { findUnique: jest.fn() },
    liveSession: { count: jest.fn(), findUnique: jest.fn(), create: jest.fn() },
    liveParticipant: { upsert: jest.fn() },
    $transaction: jest.fn(),
  },
}));

import { CreateSchoolLiveSessionUseCase, JoinSchoolLiveSessionUseCase } from '../../../src/application/use-cases/school/SchoolLiveUseCases';
import { prisma } from '../../../src/infrastructure/database/prisma';

const p = prisma as any;
const teacher = { id: 'su1', schoolId: 'sch1', schoolRole: 'TEACHER', branchId: null, departmentId: 'd1', classroomId: null };
const student = { id: 'su2', schoolId: 'sch1', schoolRole: 'STUDENT', branchId: null, departmentId: null, classroomId: 'c1' };
const validQ = [{ content: 'S', options: [{ content: 'A', isCorrect: true }, { content: 'B' }] }];

describe('CreateSchoolLiveSessionUseCase', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    p.schoolUser.findFirst.mockResolvedValue(teacher);
    p.school.findUnique.mockResolvedValue({ annualLiveLimit: 10, usedLiveCount: 0 });
    p.liveSession.count.mockResolvedValue(0);
    p.liveSession.findUnique.mockResolvedValue(null); // joinCode unique
    p.$transaction.mockImplementation(async (fn: any) => fn({
      liveSession: { create: jest.fn().mockResolvedValue({ id: 'ls1', joinCode: '123456' }) },
      liveQuestion: { create: jest.fn().mockResolvedValue({ id: 'q1' }) },
      liveOption: { createMany: jest.fn() },
    }));
  });

  it('kota dolu → LIVE_QUOTA_EXCEEDED', async () => {
    p.school.findUnique.mockResolvedValue({ annualLiveLimit: 5, usedLiveCount: 3 });
    p.liveSession.count.mockResolvedValue(2); // 3 + 2 >= 5
    await expect(new CreateSchoolLiveSessionUseCase().execute({ title: 'T', questions: validQ }, 'u1')).rejects.toMatchObject({ code: 'LIVE_QUOTA_EXCEEDED' });
  });

  it('limit 0 → sınırsız (oluşturulur)', async () => {
    p.school.findUnique.mockResolvedValue({ annualLiveLimit: 0, usedLiveCount: 999 });
    const r = await new CreateSchoolLiveSessionUseCase().execute({ title: 'T', questions: validQ }, 'u1');
    expect(r.joinCode).toBe('123456');
  });

  it('tam 1 doğru şık değilse → ONE_CORRECT_REQUIRED', async () => {
    await expect(new CreateSchoolLiveSessionUseCase().execute({ title: 'T', questions: [{ content: 'S', options: [{ content: 'A', isCorrect: true }, { content: 'B', isCorrect: true }] }] }, 'u1')).rejects.toMatchObject({ code: 'ONE_CORRECT_REQUIRED' });
  });

  it('öğrenci oluşturamaz → FORBIDDEN_SCHOOL_ROLE', async () => {
    p.schoolUser.findFirst.mockResolvedValue(student);
    await expect(new CreateSchoolLiveSessionUseCase().execute({ title: 'T', questions: validQ }, 'u2')).rejects.toMatchObject({ code: 'FORBIDDEN_SCHOOL_ROLE' });
  });
});

describe('JoinSchoolLiveSessionUseCase', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    p.schoolUser.findFirst.mockResolvedValue(student);
    p.liveParticipant.upsert.mockResolvedValue({ id: 'pp1' });
  });

  it('başka okulun oturumu → CROSS_SCHOOL', async () => {
    p.liveSession.findUnique.mockResolvedValue({ id: 'ls1', schoolId: 'other', status: 'ACTIVE' });
    await expect(new JoinSchoolLiveSessionUseCase().execute({ joinCode: '123456' }, 'u2')).rejects.toMatchObject({ code: 'CROSS_SCHOOL' });
  });

  it('bitmiş oturum → SESSION_ENDED', async () => {
    p.liveSession.findUnique.mockResolvedValue({ id: 'ls1', schoolId: 'sch1', status: 'ENDED' });
    await expect(new JoinSchoolLiveSessionUseCase().execute({ joinCode: '123456' }, 'u2')).rejects.toMatchObject({ code: 'SESSION_ENDED' });
  });

  it('aynı okul aktif oturum → katılım başarılı', async () => {
    p.liveSession.findUnique.mockResolvedValue({ id: 'ls1', schoolId: 'sch1', status: 'ACTIVE' });
    const r = await new JoinSchoolLiveSessionUseCase().execute({ joinCode: '123456' }, 'u2');
    expect(r.sessionId).toBe('ls1');
  });
});
