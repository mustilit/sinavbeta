/**
 * schoolHelpers — branch (dal) kapsamı: saf yardımcılar (isManagerForBranch,
 * scopedClassroomWhere, formatSchoolUsername default) + prisma'lı kapsam çözücüler
 * (resolveSchoolContext, resolveLiveCreatorScope, liveScopeWhere, resolveReportScope).
 */
jest.mock('../../../src/infrastructure/database/prisma', () => ({
  prisma: {
    schoolUser: { findFirst: jest.fn(), findUnique: jest.fn() },
    schoolLevel: { findMany: jest.fn(async () => []) },
    classroom: { findMany: jest.fn(async () => []), findFirst: jest.fn(async () => null) },
    department: { findMany: jest.fn(async () => []), findFirst: jest.fn(async () => null), findUnique: jest.fn(async () => null) },
    schoolAssignment: { findMany: jest.fn(async () => []) }, // resolveReportScope: kendi ödev sınıfları
  },
}));

import {
  formatSchoolUsername, isManagerForBranch, scopedClassroomWhere,
  resolveSchoolContext, resolveLiveCreatorScope, liveScopeWhere, resolveReportScope,
  nextSchoolUsername,
} from '../../../src/application/use-cases/school/schoolHelpers';
import { prisma } from '../../../src/infrastructure/database/prisma';

const p = prisma as any;
const ctxOf = (over: any = {}) => ({ schoolUserId: 'su0', userId: 'u0', schoolId: 'sch1', schoolRole: 'SCHOOL_ADMIN', branchId: null, departmentId: null, classroomId: null, ...over });
beforeEach(() => jest.clearAllMocks());

describe('formatSchoolUsername — bilinmeyen rol → X', () => {
  it('tanımsız rol → X öneki', () => {
    expect(formatSchoolUsername('ANK', 'WORKER' as any, 1)).toBe('ANK-X-0001');
  });
});

describe('nextSchoolUsername — tüm adaylar çakışırsa', () => {
  it('50 deneme çakışır → USERNAME_GENERATION_FAILED', async () => {
    const tx: any = { schoolUser: { count: jest.fn(async () => 0), findUnique: jest.fn(async () => ({ id: 'clash' })) } };
    await expect(nextSchoolUsername(tx, 'sch1', 'ANK', 'STUDENT')).rejects.toMatchObject({ code: 'USERNAME_GENERATION_FAILED' });
  });
});

describe('isManagerForBranch', () => {
  it('SCHOOL_ADMIN → true', () => expect(isManagerForBranch(ctxOf(), 'b1')).toBe(true));
  it('BRANCH_ADMIN eşleşen şube → true', () => expect(isManagerForBranch(ctxOf({ schoolRole: 'BRANCH_ADMIN', branchId: 'b1' }), 'b1')).toBe(true));
  it('BRANCH_ADMIN farklı şube → false', () => expect(isManagerForBranch(ctxOf({ schoolRole: 'BRANCH_ADMIN', branchId: 'b1' }), 'b2')).toBe(false));
  it('BRANCH_ADMIN null branchId → false', () => expect(isManagerForBranch(ctxOf({ schoolRole: 'BRANCH_ADMIN', branchId: 'b1' }), null)).toBe(false));
  it('TEACHER → false', () => expect(isManagerForBranch(ctxOf({ schoolRole: 'TEACHER' }), 'b1')).toBe(false));
});

describe('scopedClassroomWhere', () => {
  const base = { schoolId: 'sch1', schoolUserId: 'su0', schoolRole: 'TEACHER' as const, isSchoolAdmin: false };
  it('wholeSchool → { schoolId }', () => {
    expect(scopedClassroomWhere({ ...base, wholeSchool: true, fullBranchIds: [], fullLevelIds: [], soloClassroomIds: [], departmentIds: [], subjects: [] } as any)).toEqual({ schoolId: 'sch1' });
  });
  it('branch/level/solo OR', () => {
    const w: any = scopedClassroomWhere({ ...base, wholeSchool: false, fullBranchIds: ['b1'], fullLevelIds: ['lv1'], soloClassroomIds: ['c1'], departmentIds: [], subjects: [] } as any);
    expect(w.OR).toEqual(expect.arrayContaining([{ branchId: { in: ['b1'] } }, { levelId: { in: ['lv1'] } }, { id: { in: ['c1'] } }]));
  });
  it('boş → { id: __none__ }', () => {
    expect(scopedClassroomWhere({ ...base, wholeSchool: false, fullBranchIds: [], fullLevelIds: [], soloClassroomIds: [], departmentIds: [], subjects: [] } as any)).toEqual({ id: '__none__' });
  });
});

describe('resolveSchoolContext', () => {
  it('userId yok → UNAUTHORIZED', async () => {
    await expect(resolveSchoolContext(undefined)).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
  it('okul kullanıcısı değil → NOT_SCHOOL_USER', async () => {
    p.schoolUser.findFirst.mockResolvedValue(null);
    await expect(resolveSchoolContext('u0')).rejects.toMatchObject({ code: 'NOT_SCHOOL_USER' });
  });
  it('başarı → ctx', async () => {
    p.schoolUser.findFirst.mockResolvedValue({ id: 'su0', schoolId: 'sch1', schoolRole: 'TEACHER', branchId: 'b1', departmentId: 'd1', classroomId: 'c1' });
    const ctx = await resolveSchoolContext('u0');
    expect(ctx).toMatchObject({ schoolUserId: 'su0', userId: 'u0', schoolRole: 'TEACHER' });
  });
});

describe('resolveLiveCreatorScope', () => {
  it('SCHOOL_ADMIN → empty', async () => {
    expect(await resolveLiveCreatorScope(ctxOf())).toMatchObject({ schoolBranchId: null });
  });
  it('BRANCH_ADMIN → branchId (?? null)', async () => {
    expect(await resolveLiveCreatorScope(ctxOf({ schoolRole: 'BRANCH_ADMIN', branchId: 'b1' }))).toMatchObject({ schoolBranchId: 'b1' });
  });
  it('BRANCH_ADMIN branchId null → null', async () => {
    expect(await resolveLiveCreatorScope(ctxOf({ schoolRole: 'BRANCH_ADMIN', branchId: null }))).toMatchObject({ schoolBranchId: null });
  });
  it('sınıf öğretmeni → classroom scope', async () => {
    p.classroom.findFirst.mockResolvedValue({ id: 'c1', levelId: 'lv1', branchId: 'b1' });
    expect(await resolveLiveCreatorScope(ctxOf({ schoolRole: 'TEACHER' }))).toMatchObject({ schoolClassroomId: 'c1', schoolLevelId: 'lv1' });
  });
  it('sınıf öğretmeni, sınıf levelId null → schoolLevelId null', async () => {
    p.classroom.findFirst.mockResolvedValue({ id: 'c1', levelId: null, branchId: 'b1' });
    expect(await resolveLiveCreatorScope(ctxOf({ schoolRole: 'TEACHER' }))).toMatchObject({ schoolClassroomId: 'c1', schoolLevelId: null });
  });
  it('seviye sorumlusu → level scope', async () => {
    p.classroom.findFirst.mockResolvedValue(null);
    p.schoolLevel.findMany.mockResolvedValue([]); // not used here; findFirst path
    (p.schoolLevel as any).findFirst = jest.fn().mockResolvedValue({ id: 'lv1', branchId: 'b1' });
    expect(await resolveLiveCreatorScope(ctxOf({ schoolRole: 'TEACHER' }))).toMatchObject({ schoolLevelId: 'lv1', schoolClassroomId: null });
  });
  it('zümre başkanı (ctx.departmentId) → dept scope', async () => {
    p.classroom.findFirst.mockResolvedValue(null);
    (p.schoolLevel as any).findFirst = jest.fn().mockResolvedValue(null);
    p.department.findUnique.mockResolvedValue({ branchId: 'b1', levelId: null });
    expect(await resolveLiveCreatorScope(ctxOf({ schoolRole: 'DEPT_HEAD', departmentId: 'd1' }))).toMatchObject({ schoolDepartmentId: 'd1', schoolBranchId: 'b1' });
  });
  it('zümre başkanlığı yok → empty', async () => {
    p.classroom.findFirst.mockResolvedValue(null);
    (p.schoolLevel as any).findFirst = jest.fn().mockResolvedValue(null);
    p.department.findFirst.mockResolvedValue(null); // headed yok
    expect(await resolveLiveCreatorScope(ctxOf({ schoolRole: 'TEACHER', departmentId: null }))).toMatchObject({ schoolDepartmentId: null });
  });
});

describe('liveScopeWhere', () => {
  it('SCHOOL_ADMIN → null', async () => {
    expect(await liveScopeWhere(ctxOf())).toBeNull();
  });
  it('BRANCH_ADMIN + level + class + dept → OR', async () => {
    p.schoolLevel.findMany.mockResolvedValue([{ id: 'lv1' }]);
    p.classroom.findMany.mockResolvedValue([{ id: 'c1' }]);
    p.department.findMany.mockResolvedValue([{ id: 'd2' }]); // headed
    const w: any = await liveScopeWhere(ctxOf({ schoolRole: 'BRANCH_ADMIN', branchId: 'b1', departmentId: 'd1' }));
    expect(w.OR).toEqual(expect.arrayContaining([
      { educatorId: 'u0' }, { schoolBranchId: 'b1' },
      { schoolLevelId: { in: ['lv1'] } }, { schoolClassroomId: { in: ['c1'] } },
      { schoolDepartmentId: { in: ['d1', 'd2'] } },
    ]));
  });
  it('TEACHER kapsamsız → yalnız educatorId', async () => {
    p.schoolLevel.findMany.mockResolvedValue([]);
    p.classroom.findMany.mockResolvedValue([]);
    p.department.findMany.mockResolvedValue([]);
    const w: any = await liveScopeWhere(ctxOf({ schoolRole: 'TEACHER', departmentId: null }));
    expect(w.OR).toEqual([{ educatorId: 'u0' }]);
  });
});

describe('resolveReportScope', () => {
  it('SCHOOL_ADMIN → isSchoolAdmin true', async () => {
    p.schoolUser.findFirst.mockResolvedValue({ id: 'su0', schoolId: 'sch1', schoolRole: 'SCHOOL_ADMIN', branchId: null, departmentId: null, classroomId: null });
    const rs = await resolveReportScope('u0');
    expect(rs).toMatchObject({ isSchoolAdmin: true, empty: false });
  });
  it('zümre başkanı okul-geneli (levelId+branchId null) → subjectSpan { schoolId }', async () => {
    p.schoolUser.findFirst.mockResolvedValue({ id: 'su0', schoolId: 'sch1', schoolRole: 'DEPT_HEAD', branchId: null, departmentId: 'd1', classroomId: null });
    p.schoolLevel.findMany.mockResolvedValue([]);
    p.classroom.findMany.mockResolvedValue([]);
    p.department.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 'd1', levelId: null, branchId: null }]);
    const rs = await resolveReportScope('u0');
    expect(rs.subjectSpanWhere).toEqual([{ schoolId: 'sch1' }]);
  });
  it('zümre başkanı şube-geneli (branchId) → subjectSpan { branchId }', async () => {
    p.schoolUser.findFirst.mockResolvedValue({ id: 'su0', schoolId: 'sch1', schoolRole: 'DEPT_HEAD', branchId: null, departmentId: 'd1', classroomId: null });
    p.schoolLevel.findMany.mockResolvedValue([]);
    p.classroom.findMany.mockResolvedValue([]);
    p.department.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 'd1', levelId: null, branchId: 'b1' }]);
    const rs = await resolveReportScope('u0');
    expect(rs.subjectSpanWhere).toEqual([{ branchId: 'b1' }]);
  });
  it('BRANCH_ADMIN → allSubjectWhere { branchId }; düz üye → empty', async () => {
    p.schoolUser.findFirst.mockResolvedValue({ id: 'su0', schoolId: 'sch1', schoolRole: 'BRANCH_ADMIN', branchId: 'b1', departmentId: null, classroomId: null });
    p.schoolLevel.findMany.mockResolvedValue([]);
    p.classroom.findMany.mockResolvedValue([]);
    p.department.findMany.mockResolvedValue([]);
    const rs = await resolveReportScope('u0');
    expect(rs.allSubjectWhere).toEqual(expect.arrayContaining([{ branchId: 'b1' }]));
  });
});
