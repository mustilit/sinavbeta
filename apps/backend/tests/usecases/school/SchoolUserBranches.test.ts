/**
 * E-Sınıf SchoolUser — branch (dal) kapsamı.
 * Create not-found + rol bazlı branch/department + ?? savunmaları, Bulk not-found/too-many/?? ,
 * List limit/role/cursor/text/period dalları + membershipWhere or-empty + scope level lookup.
 */
jest.mock('../../../src/infrastructure/database/prisma', () => ({
  prisma: {
    schoolUser: { findFirst: jest.fn(), findUnique: jest.fn(async () => ({ userId: 'u0', departmentId: null })), count: jest.fn(async () => 0), create: jest.fn(), findMany: jest.fn(async () => []), update: jest.fn(async () => ({})) },
    school: { findUnique: jest.fn(async () => ({ id: 'sch1', code: 'ANK', tenantId: 'ten1', maxUsers: 0 })) },
    branch: { findFirst: jest.fn(async () => ({ id: 'b1' })) },
    classroom: { findFirst: jest.fn(async () => ({ id: 'c1', branchId: 'b1' })), findMany: jest.fn(async () => []) },
    department: { findFirst: jest.fn(async () => ({ id: 'd1' })), findMany: jest.fn(async () => []) },
    schoolLevel: { findMany: jest.fn(async () => []) },
    user: { create: jest.fn(), update: jest.fn(async () => ({})) },
    $transaction: jest.fn(async (fn: any, _opts?: any) => fn({
      schoolUser: { count: jest.fn(async () => 0), findUnique: jest.fn(async () => null), create: jest.fn(async ({ data }: any) => ({ id: 'su-new', ...data })) },
      user: { create: jest.fn(async () => ({ id: 'u-new' })) },
    })),
  },
}));
jest.mock('../../../src/common/tenant', () => ({ getDefaultTenantId: () => 'ten1' }));
jest.mock('bcryptjs', () => ({ hash: jest.fn(async () => 'hashed') }));

import * as U from '../../../src/application/use-cases/school/SchoolUserUseCases';
import { prisma } from '../../../src/infrastructure/database/prisma';

const p = prisma as any;
const admin = { id: 'su0', schoolId: 'sch1', schoolRole: 'SCHOOL_ADMIN', branchId: null, departmentId: null, classroomId: null };
const ctxOf = (over: any = {}) => ({ ...admin, ...over });

beforeEach(() => {
  jest.clearAllMocks();
  p.schoolUser.findFirst.mockResolvedValue(ctxOf());
  p.school.findUnique.mockResolvedValue({ id: 'sch1', code: 'ANK', tenantId: 'ten1', maxUsers: 0 });
  p.schoolUser.count.mockResolvedValue(0);
  p.schoolUser.findUnique.mockResolvedValue({ userId: 'u0', departmentId: null });
});

describe('CreateSchoolUser — not-found + rol bazlı alanlar', () => {
  it('okul yok → SCHOOL_NOT_FOUND', async () => {
    p.school.findUnique.mockResolvedValue(null);
    await expect(new U.CreateSchoolUserUseCase().execute({ schoolRole: 'TEACHER' }, 'u0')).rejects.toMatchObject({ code: 'SCHOOL_NOT_FOUND' });
  });
  it('BRANCH_ADMIN + branchId → branchId atanır; ad verilmedi (?? "")', async () => {
    const r = await new U.CreateSchoolUserUseCase().execute({ schoolRole: 'BRANCH_ADMIN', branchId: 'b1' }, 'u0');
    expect(r.schoolRole).toBe('BRANCH_ADMIN');
  });
  it('TEACHER + departmentId → departmentId atanır; firstName dolu', async () => {
    const r = await new U.CreateSchoolUserUseCase().execute({ schoolRole: 'TEACHER', departmentId: 'd1', firstName: 'Ali', lastName: 'V' }, 'u0');
    expect(r.schoolRole).toBe('TEACHER');
  });
  it('BRANCH_ADMIN branchId verilmedi (?? null)', async () => {
    const r = await new U.CreateSchoolUserUseCase().execute({ schoolRole: 'BRANCH_ADMIN' }, 'u0');
    expect(r.schoolRole).toBe('BRANCH_ADMIN');
  });
  it('DEPT_HEAD departmentId verilmedi (?? null)', async () => {
    const r = await new U.CreateSchoolUserUseCase().execute({ schoolRole: 'DEPT_HEAD' }, 'u0');
    expect(r.schoolRole).toBe('DEPT_HEAD');
  });
});

describe('BulkCreateStudents — not-found/too-many/?? + ad', () => {
  beforeEach(() => {
    p.classroom.findFirst.mockResolvedValue({ id: 'c1', branchId: 'b1', adminUserId: null, level: { adminUserId: null } });
  });
  it('okul yok → SCHOOL_NOT_FOUND', async () => {
    p.school.findUnique.mockResolvedValue(null);
    await expect(new U.BulkCreateStudentsUseCase().execute('c1', { students: [{ firstName: 'A' }] }, 'u0')).rejects.toMatchObject({ code: 'SCHOOL_NOT_FOUND' });
  });
  it('students undefined → NO_STUDENTS (?? [])', async () => {
    await expect(new U.BulkCreateStudentsUseCase().execute('c1', {} as any, 'u0')).rejects.toMatchObject({ code: 'NO_STUDENTS' });
  });
  it('300+ → TOO_MANY', async () => {
    const students = Array.from({ length: 301 }, (_, i) => ({ firstName: `A${i}` }));
    await expect(new U.BulkCreateStudentsUseCase().execute('c1', { students }, 'u0')).rejects.toMatchObject({ code: 'TOO_MANY' });
  });
  it('başarı: ad/soyad dolu (|| null değil) + studentNo', async () => {
    const r = await new U.BulkCreateStudentsUseCase().execute('c1', { students: [{ firstName: 'Ali', lastName: 'Veli', studentNo: '101' }] }, 'u0');
    expect(r.count).toBe(1);
    expect(r.created[0]).toMatchObject({ name: 'Ali Veli', studentNo: '101' });
  });
  it('başarı: studentNo yok (?? "" → null) + yalnız ad / yalnız soyad satırları', async () => {
    const r = await new U.BulkCreateStudentsUseCase().execute('c1', { students: [
      { firstName: 'Ali' },             // lastName boş → || null
      { lastName: 'Veli' },             // firstName boş → || null
    ] }, 'u0');
    expect(r.count).toBe(2);
    expect(r.created[0].studentNo).toBeNull();
  });
});

describe('ListSchoolUsers — limit/role/cursor/text/period + kapsam dalları', () => {
  it('admin: limit default + role filtresi + text + cursor + nextCursor', async () => {
    const rows = Array.from({ length: 31 }, (_, i) => ({ id: `su${i}`, username: `U${i}`, studentNo: null, schoolRole: 'TEACHER', isActive: true, createdAt: new Date(), user: { firstName: 'A', lastName: 'B' }, branch: null, classroom: null, department: null }));
    p.schoolUser.findMany.mockResolvedValue(rows);
    const r = await new U.ListSchoolUsersUseCase().execute({ role: 'TEACHER', q: 'u', cursor: 'su5' }, 'u0');
    expect(r.items).toHaveLength(30);
    expect(r.nextCursor).toBe('su29');
    const args = p.schoolUser.findMany.mock.calls[0][0];
    expect(args.where.schoolRole).toBe('TEACHER');
    expect(args.where.username).toBeTruthy();
    expect(args.cursor).toEqual({ id: 'su5' });
  });
  it('admin: rol verilmedi → öğrenci hariç (not STUDENT)', async () => {
    p.schoolUser.findMany.mockResolvedValue([]);
    await new U.ListSchoolUsersUseCase().execute({}, 'u0');
    expect(p.schoolUser.findMany.mock.calls[0][0].where.schoolRole).toEqual({ not: 'STUDENT' });
  });
  it('STUDENT rolü → dönem süzmesi (periodId)', async () => {
    p.school.findUnique.mockResolvedValue({ periodId: 'p-cur' });
    p.schoolUser.findMany.mockResolvedValue([]);
    await new U.ListSchoolUsersUseCase().execute({ role: 'STUDENT' }, 'u0');
    expect(p.schoolUser.findMany.mock.calls[0][0].where.periodId).toBe('p-cur');
  });
  it('BRANCH_ADMIN branchId null → membershipWhere or-empty (__none__)', async () => {
    p.schoolUser.findFirst.mockResolvedValue(ctxOf({ schoolRole: 'BRANCH_ADMIN', branchId: null }));
    p.schoolUser.findMany.mockResolvedValue([]);
    await new U.ListSchoolUsersUseCase().execute({}, 'u0');
    const and = p.schoolUser.findMany.mock.calls[0][0].where.AND;
    expect(JSON.stringify(and)).toContain('__none__');
  });
  it('non-admin kapsamsız → FORBIDDEN', async () => {
    p.schoolUser.findFirst.mockResolvedValue(ctxOf({ schoolRole: 'TEACHER', departmentId: null }));
    p.schoolUser.findUnique.mockResolvedValue({ userId: 'uT', departmentId: null });
    p.schoolLevel.findMany.mockResolvedValue([]);
    p.classroom.findMany.mockResolvedValue([]);
    p.department.findMany.mockResolvedValue([]);
    await expect(new U.ListSchoolUsersUseCase().execute({}, 'uT')).rejects.toMatchObject({ code: 'FORBIDDEN_SCHOOL_ROLE' });
  });
  it('seviye sorumlusu: fullLevelIds → seviye şubesi membershipWhere', async () => {
    p.schoolUser.findFirst.mockResolvedValue(ctxOf({ schoolRole: 'TEACHER', departmentId: null }));
    p.schoolUser.findUnique.mockResolvedValue({ userId: 'uT', departmentId: null });
    p.schoolLevel.findMany
      .mockResolvedValueOnce([{ id: 'lv5' }])            // resolveSchoolScope: adminUserId seviye sorumlusu
      .mockResolvedValueOnce([{ branchId: 'b1' }]);      // ListUsers: fullLevelIds → branchId
    p.classroom.findMany.mockResolvedValue([]);
    p.department.findMany.mockResolvedValue([]);
    p.schoolUser.findMany.mockResolvedValue([]);
    await new U.ListSchoolUsersUseCase().execute({ branchId: 'b1' }, 'uT');
    expect(p.schoolUser.findMany.mock.calls[0][0].where.AND).toBeTruthy();
  });
  it('boş sayfa → nextCursor null', async () => {
    p.schoolUser.findMany.mockResolvedValue([]);
    const r = await new U.ListSchoolUsersUseCase().execute({}, 'u0');
    expect(r.nextCursor).toBeNull();
  });
});

describe('Set/Reset — not-found', () => {
  it('SetActive: kullanıcı yok → USER_NOT_FOUND', async () => {
    p.schoolUser.findFirst.mockResolvedValueOnce(ctxOf()).mockResolvedValueOnce(null);
    await expect(new U.SetSchoolUserActiveUseCase().execute('sX', { isActive: false }, 'u0')).rejects.toMatchObject({ code: 'USER_NOT_FOUND' });
  });
  it('ResetPassword: kullanıcı yok → USER_NOT_FOUND', async () => {
    p.schoolUser.findFirst.mockResolvedValueOnce(ctxOf()).mockResolvedValueOnce(null);
    await expect(new U.ResetSchoolUserPasswordUseCase().execute('sX', 'u0')).rejects.toMatchObject({ code: 'USER_NOT_FOUND' });
  });
});
