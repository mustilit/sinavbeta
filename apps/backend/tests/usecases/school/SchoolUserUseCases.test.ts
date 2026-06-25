/**
 * CreateSchoolUserUseCase — okul kullanıcısı ekleme:
 * yetki, geçersiz rol, kota, başarı (otomatik username + geçici şifre).
 */
jest.mock('../../../src/infrastructure/database/prisma', () => ({
  prisma: {
    schoolUser: { findFirst: jest.fn(), count: jest.fn(), create: jest.fn() },
    school: { findUnique: jest.fn() },
    branch: { findFirst: jest.fn() },
    classroom: { findFirst: jest.fn() },
    department: { findFirst: jest.fn() },
    user: { create: jest.fn() },
    $transaction: jest.fn(),
  },
}));

import { CreateSchoolUserUseCase, BulkCreateStudentsUseCase } from '../../../src/application/use-cases/school/SchoolUserUseCases';
import { prisma } from '../../../src/infrastructure/database/prisma';

const p = prisma as any;

function asAdmin() {
  // resolveSchoolContext → SCHOOL_ADMIN bağlamı
  p.schoolUser.findFirst.mockResolvedValue({
    id: 'su-admin', schoolId: 'sch1', schoolRole: 'SCHOOL_ADMIN', branchId: null, departmentId: null, classroomId: null,
  });
}

describe('CreateSchoolUserUseCase', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    p.school.findUnique.mockResolvedValue({ id: 'sch1', code: 'ANK', tenantId: 'ten1', maxUsers: 100 });
    p.schoolUser.count.mockResolvedValue(0);
    // nextSchoolUsername: tx.schoolUser.count + findUnique(null) → ANK-S-0001
    p.$transaction.mockImplementation(async (fn: any) =>
      fn({
        schoolUser: { count: jest.fn().mockResolvedValue(0), findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 'su-new', username: 'ANK-S-0001' }) },
        user: { create: jest.fn().mockResolvedValue({ id: 'u-new' }) },
      }),
    );
  });

  it('okul kullanıcısı değilse NOT_SCHOOL_USER (403)', async () => {
    p.schoolUser.findFirst.mockResolvedValue(null);
    await expect(new CreateSchoolUserUseCase().execute({ schoolRole: 'STUDENT' }, 'u1'))
      .rejects.toMatchObject({ code: 'NOT_SCHOOL_USER' });
  });

  it('SCHOOL_ADMIN değilse FORBIDDEN_SCHOOL_ROLE (403)', async () => {
    p.schoolUser.findFirst.mockResolvedValue({ id: 'su', schoolId: 'sch1', schoolRole: 'TEACHER', branchId: null, departmentId: null, classroomId: null });
    await expect(new CreateSchoolUserUseCase().execute({ schoolRole: 'STUDENT' }, 'u1'))
      .rejects.toMatchObject({ code: 'FORBIDDEN_SCHOOL_ROLE' });
  });

  it('SCHOOL_ADMIN rolü buradan oluşturulamaz → INVALID_ROLE', async () => {
    asAdmin();
    await expect(new CreateSchoolUserUseCase().execute({ schoolRole: 'SCHOOL_ADMIN' }, 'u1'))
      .rejects.toMatchObject({ code: 'INVALID_ROLE' });
  });

  it('kota dolu → USER_QUOTA_EXCEEDED (409)', async () => {
    asAdmin();
    p.school.findUnique.mockResolvedValue({ id: 'sch1', code: 'ANK', tenantId: 'ten1', maxUsers: 5 });
    p.schoolUser.count.mockResolvedValue(5);
    await expect(new CreateSchoolUserUseCase().execute({ schoolRole: 'STUDENT' }, 'u1'))
      .rejects.toMatchObject({ code: 'USER_QUOTA_EXCEEDED' });
  });

  it('başarı: otomatik username + geçici şifre döner', async () => {
    asAdmin();
    const res = await new CreateSchoolUserUseCase().execute({ schoolRole: 'STUDENT', firstName: 'Ali' }, 'u1');
    expect(res.username).toBe('ANK-S-0001');
    expect(res.schoolRole).toBe('STUDENT');
    expect(res.tempPassword).toHaveLength(8);
    expect(res.schoolUserId).toBe('su-new');
  });
});

describe('BulkCreateStudentsUseCase (Excel)', () => {
  let seq = 0;
  beforeEach(() => {
    jest.clearAllMocks();
    seq = 0;
    asAdmin();
    p.school.findUnique.mockResolvedValue({ id: 'sch1', code: 'ANK', tenantId: 'ten1', maxUsers: 100 });
    p.classroom.findFirst.mockResolvedValue({ id: 'c1', branchId: 'b1' });
    p.schoolUser.count.mockResolvedValue(0);
    p.$transaction.mockImplementation(async (fn: any) =>
      fn({
        schoolUser: {
          count: jest.fn().mockImplementation(async () => seq),
          findUnique: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockImplementation(async ({ data }: any) => { seq++; return { id: `su-${seq}`, username: data.username }; }),
        },
        user: { create: jest.fn().mockResolvedValue({ id: 'u-x' }) },
      }),
    );
  });

  it('sınıf yoksa → CLASSROOM_NOT_FOUND', async () => {
    p.classroom.findFirst.mockResolvedValue(null);
    await expect(new BulkCreateStudentsUseCase().execute('x', { students: [{ firstName: 'A', lastName: 'B' }] }, 'u1'))
      .rejects.toMatchObject({ code: 'CLASSROOM_NOT_FOUND' });
  });
  it('boş/geçersiz satırlar → NO_STUDENTS', async () => {
    await expect(new BulkCreateStudentsUseCase().execute('c1', { students: [{ firstName: ' ', lastName: '' }] }, 'u1'))
      .rejects.toMatchObject({ code: 'NO_STUDENTS' });
  });
  it('kota yetersiz → USER_QUOTA_EXCEEDED', async () => {
    p.school.findUnique.mockResolvedValue({ id: 'sch1', code: 'ANK', tenantId: 'ten1', maxUsers: 1 });
    p.schoolUser.count.mockResolvedValue(0);
    await expect(new BulkCreateStudentsUseCase().execute('c1', { students: [{ firstName: 'A' }, { firstName: 'B' }] }, 'u1'))
      .rejects.toMatchObject({ code: 'USER_QUOTA_EXCEEDED' });
  });
  it('başarı: her öğrenci için username + şifre döner', async () => {
    const res = await new BulkCreateStudentsUseCase().execute('c1', { students: [{ firstName: 'Ali', lastName: 'Veli' }, { firstName: 'Ayşe', lastName: 'Demir' }] }, 'u1');
    expect(res.count).toBe(2);
    expect(res.created).toHaveLength(2);
    expect(res.created[0]).toMatchObject({ name: 'Ali Veli', username: 'ANK-S-0001' });
    expect(res.created[1].username).toBe('ANK-S-0002');
    expect(res.created[0].tempPassword).toHaveLength(8);
  });
});
