/**
 * resolveSchoolScope — alt rol görüntüleme kapsamı (şube/seviye/sınıf/zümre).
 */
jest.mock('../../../src/infrastructure/database/prisma', () => ({
  prisma: {
    schoolUser: { findFirst: jest.fn(), findUnique: jest.fn() },
    schoolLevel: { findMany: jest.fn() },
    classroom: { findMany: jest.fn() },
    department: { findMany: jest.fn() },
  },
}));

import { resolveSchoolScope, scopeIsEmpty } from '../../../src/application/use-cases/school/schoolHelpers';
import { prisma } from '../../../src/infrastructure/database/prisma';

const p = prisma as any;

function ctx(over: any = {}) {
  return { id: 'su1', schoolId: 'sch1', schoolRole: 'TEACHER', branchId: null, departmentId: null, classroomId: null, ...over };
}

beforeEach(() => {
  jest.clearAllMocks();
  p.schoolUser.findUnique.mockResolvedValue({ userId: 'u1', departmentId: null });
  p.schoolLevel.findMany.mockResolvedValue([]);
  p.classroom.findMany.mockResolvedValue([]);
  p.department.findMany.mockResolvedValue([]);
});

it('SCHOOL_ADMIN → tüm okul', async () => {
  p.schoolUser.findFirst.mockResolvedValue(ctx({ schoolRole: 'SCHOOL_ADMIN' }));
  const s = await resolveSchoolScope('u1');
  expect(s.isSchoolAdmin).toBe(true);
  expect(s.wholeSchool).toBe(true);
  expect(scopeIsEmpty(s)).toBe(false);
});

it('BRANCH_ADMIN → kendi şubesi (fullBranch)', async () => {
  p.schoolUser.findFirst.mockResolvedValue(ctx({ schoolRole: 'BRANCH_ADMIN', branchId: 'b1' }));
  const s = await resolveSchoolScope('u1');
  expect(s.fullBranchIds).toEqual(['b1']);
  expect(s.wholeSchool).toBe(false);
});

it('Seviye sorumlusu → kendi seviyesi (fullLevel)', async () => {
  p.schoolUser.findFirst.mockResolvedValue(ctx());
  p.schoolLevel.findMany.mockResolvedValue([{ id: 'lv1' }]);
  const s = await resolveSchoolScope('u1');
  expect(s.fullLevelIds).toEqual(['lv1']);
});

it('Sınıf öğretmeni → kendi sınıfı (soloClassroom)', async () => {
  p.schoolUser.findFirst.mockResolvedValue(ctx());
  p.classroom.findMany.mockResolvedValue([{ id: 'c1' }]);
  const s = await resolveSchoolScope('u1');
  expect(s.soloClassroomIds).toEqual(['c1']);
});

it('Zümre başkanı (seviye zümresi) → seviye + branş', async () => {
  p.schoolUser.findFirst.mockResolvedValue(ctx({ schoolRole: 'DEPT_HEAD' }));
  p.schoolUser.findUnique.mockResolvedValue({ userId: 'u1', departmentId: 'd1' });
  p.department.findMany
    .mockResolvedValueOnce([{ id: 'd1' }])                                         // headUserId sorgusu
    .mockResolvedValueOnce([{ id: 'd1', branchId: 'b1', levelId: 'lv2', subject: 'Matematik' }]); // genişletme
  const s = await resolveSchoolScope('u1');
  expect(s.departmentIds).toEqual(['d1']);
  expect(s.fullLevelIds).toContain('lv2');
  expect(s.subjects).toEqual(['Matematik']);
});

it('hiçbir designation yoksa kapsam boş', async () => {
  p.schoolUser.findFirst.mockResolvedValue(ctx());
  const s = await resolveSchoolScope('u1');
  expect(scopeIsEmpty(s)).toBe(true);
});
