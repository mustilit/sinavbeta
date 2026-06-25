/**
 * E-Sınıf — Okul Yöneticisi organizasyon use-case'leri (Sprint 1):
 * Şube / Sınıf / Zümre CRUD + öğrenci-öğretmen atama + kota.
 * Hepsi resolveSchoolContext ile okul bağlamına kilitlenir (tenant + schoolId izolasyonu).
 */
import { prisma } from '../../../infrastructure/database/prisma';
import { AppError } from '../../errors/AppError';
import { logger } from '../../../infrastructure/logger/logger';
import { resolveSchoolContext, requireSchoolRole } from './schoolHelpers';

// ── Şube ──────────────────────────────────────────────────────────────────
export class CreateBranchUseCase {
  async execute(input: { name: string }, actorId?: string) {
    const ctx = await resolveSchoolContext(actorId);
    requireSchoolRole(ctx, 'SCHOOL_ADMIN');
    const name = (input.name ?? '').trim();
    if (!name) throw new AppError('NAME_REQUIRED', 'Şube adı zorunlu', 400);
    const created = await prisma.branch.create({ data: { schoolId: ctx.schoolId, name } });
    logger.info('school.branch.created', { id: created.id, schoolId: ctx.schoolId, actorId });
    return created;
  }
}

export class ListBranchesUseCase {
  async execute(actorId?: string) {
    const ctx = await resolveSchoolContext(actorId);
    requireSchoolRole(ctx, 'SCHOOL_ADMIN', 'BRANCH_ADMIN');
    const rows = await prisma.branch.findMany({
      where: {
        schoolId: ctx.schoolId,
        // Şube yöneticisi yalnız kendi şubesini görür
        ...(ctx.schoolRole === 'BRANCH_ADMIN' ? { id: ctx.branchId ?? '__none__' } : {}),
      },
      orderBy: [{ createdAt: 'asc' }],
      include: {
        adminUser: { select: { id: true, username: true } },
        _count: { select: { classrooms: true } },
      },
    });
    return rows.map((b) => ({
      id: b.id,
      name: b.name,
      adminUsername: b.adminUser?.username ?? null,
      classroomCount: b._count.classrooms,
      createdAt: b.createdAt,
    }));
  }
}

export class AssignBranchAdminUseCase {
  async execute(branchId: string, input: { schoolUserId: string }, actorId?: string) {
    const ctx = await resolveSchoolContext(actorId);
    requireSchoolRole(ctx, 'SCHOOL_ADMIN');
    const branch = await prisma.branch.findFirst({ where: { id: branchId, schoolId: ctx.schoolId }, select: { id: true } });
    if (!branch) throw new AppError('BRANCH_NOT_FOUND', 'Şube bulunamadı', 404);
    const su = await prisma.schoolUser.findFirst({
      where: { id: input.schoolUserId, schoolId: ctx.schoolId },
      select: { id: true, userId: true },
    });
    if (!su) throw new AppError('USER_NOT_FOUND', 'Kullanıcı bulunamadı', 404);

    await prisma.$transaction([
      prisma.schoolUser.update({ where: { id: su.id }, data: { schoolRole: 'BRANCH_ADMIN' as any, branchId } }),
      prisma.branch.update({ where: { id: branchId }, data: { adminUserId: su.userId } }),
    ]);
    logger.info('school.branch.admin_assigned', { branchId, schoolUserId: su.id, actorId });
    return { ok: true };
  }
}

// ── Seviye (SchoolLevel) ─────────────────────────────────────────────────────
export class CreateLevelUseCase {
  async execute(input: { branchId: string; gradeLevel: number }, actorId?: string) {
    const ctx = await resolveSchoolContext(actorId);
    requireSchoolRole(ctx, 'SCHOOL_ADMIN', 'BRANCH_ADMIN');
    const grade = Math.floor(input.gradeLevel);
    if (!Number.isInteger(grade) || grade < 1 || grade > 12) throw new AppError('INVALID_GRADE', 'Seviye 1-12 olmalı', 400);

    const branch = await prisma.branch.findFirst({ where: { id: input.branchId, schoolId: ctx.schoolId }, select: { id: true } });
    if (!branch) throw new AppError('BRANCH_NOT_FOUND', 'Şube bulunamadı', 404);
    if (ctx.schoolRole === 'BRANCH_ADMIN' && ctx.branchId !== input.branchId)
      throw new AppError('FORBIDDEN_SCHOOL_ROLE', 'Yalnız kendi şubenize seviye ekleyebilirsiniz', 403);

    const clash = await prisma.schoolLevel.findUnique({ where: { branchId_gradeLevel: { branchId: input.branchId, gradeLevel: grade } }, select: { id: true } });
    if (clash) throw new AppError('LEVEL_EXISTS', 'Bu seviye şubede zaten var', 409);

    const created = await prisma.schoolLevel.create({ data: { schoolId: ctx.schoolId, branchId: input.branchId, gradeLevel: grade } });
    logger.info('school.level.created', { id: created.id, branchId: input.branchId, gradeLevel: grade, actorId });
    return created;
  }
}

export class AssignLevelAdminUseCase {
  async execute(levelId: string, input: { schoolUserId: string }, actorId?: string) {
    const ctx = await resolveSchoolContext(actorId);
    requireSchoolRole(ctx, 'SCHOOL_ADMIN', 'BRANCH_ADMIN');
    const level = await prisma.schoolLevel.findFirst({ where: { id: levelId, schoolId: ctx.schoolId }, select: { id: true, branchId: true } });
    if (!level) throw new AppError('LEVEL_NOT_FOUND', 'Seviye bulunamadı', 404);
    if (ctx.schoolRole === 'BRANCH_ADMIN' && ctx.branchId !== level.branchId)
      throw new AppError('FORBIDDEN_SCHOOL_ROLE', 'Yalnız kendi şubenizde işlem yapabilirsiniz', 403);
    const su = await prisma.schoolUser.findFirst({ where: { id: input.schoolUserId, schoolId: ctx.schoolId }, select: { userId: true } });
    if (!su) throw new AppError('USER_NOT_FOUND', 'Kullanıcı bulunamadı', 404);
    await prisma.schoolLevel.update({ where: { id: levelId }, data: { adminUserId: su.userId } });
    logger.info('school.level.admin_assigned', { levelId, schoolUserId: input.schoolUserId, actorId });
    return { ok: true };
  }
}

export class DeleteLevelUseCase {
  async execute(levelId: string, actorId?: string) {
    const ctx = await resolveSchoolContext(actorId);
    requireSchoolRole(ctx, 'SCHOOL_ADMIN', 'BRANCH_ADMIN');
    const level = await prisma.schoolLevel.findFirst({ where: { id: levelId, schoolId: ctx.schoolId }, select: { id: true, branchId: true, _count: { select: { classrooms: true } } } });
    if (!level) throw new AppError('LEVEL_NOT_FOUND', 'Seviye bulunamadı', 404);
    if (ctx.schoolRole === 'BRANCH_ADMIN' && ctx.branchId !== level.branchId)
      throw new AppError('FORBIDDEN_SCHOOL_ROLE', 'Yalnız kendi şubenizde işlem yapabilirsiniz', 403);
    if (level._count.classrooms > 0) throw new AppError('LEVEL_NOT_EMPTY', 'Önce seviyedeki sınıfları silin', 409);
    await prisma.schoolLevel.delete({ where: { id: levelId } });
    logger.info('school.level.deleted', { levelId, actorId });
    return { ok: true };
  }
}

// ── Sınıf ──────────────────────────────────────────────────────────────────
export class CreateClassroomUseCase {
  /** Sınıf bir SEVİYE altında oluşturulur; şube/gradeLevel seviyeden türetilir. */
  async execute(input: { levelId: string; name: string }, actorId?: string) {
    const ctx = await resolveSchoolContext(actorId);
    requireSchoolRole(ctx, 'SCHOOL_ADMIN', 'BRANCH_ADMIN');
    const name = (input.name ?? '').trim();
    if (!name) throw new AppError('NAME_REQUIRED', 'Sınıf adı zorunlu', 400);

    const level = await prisma.schoolLevel.findFirst({
      where: { id: input.levelId, schoolId: ctx.schoolId },
      select: { id: true, branchId: true, gradeLevel: true },
    });
    if (!level) throw new AppError('LEVEL_NOT_FOUND', 'Seviye bulunamadı', 404);
    if (ctx.schoolRole === 'BRANCH_ADMIN' && ctx.branchId !== level.branchId)
      throw new AppError('FORBIDDEN_SCHOOL_ROLE', 'Yalnız kendi şubenize sınıf ekleyebilirsiniz', 403);

    const created = await prisma.classroom.create({
      data: { schoolId: ctx.schoolId, branchId: level.branchId, levelId: level.id, name, gradeLevel: level.gradeLevel },
    });
    logger.info('school.classroom.created', { id: created.id, levelId: level.id, actorId });
    return created;
  }
}

export class AssignClassroomAdminUseCase {
  async execute(classroomId: string, input: { schoolUserId: string }, actorId?: string) {
    const ctx = await resolveSchoolContext(actorId);
    requireSchoolRole(ctx, 'SCHOOL_ADMIN', 'BRANCH_ADMIN');
    const classroom = await prisma.classroom.findFirst({ where: { id: classroomId, schoolId: ctx.schoolId }, select: { id: true, branchId: true } });
    if (!classroom) throw new AppError('CLASSROOM_NOT_FOUND', 'Sınıf bulunamadı', 404);
    if (ctx.schoolRole === 'BRANCH_ADMIN' && ctx.branchId !== classroom.branchId)
      throw new AppError('FORBIDDEN_SCHOOL_ROLE', 'Yalnız kendi şubenizde işlem yapabilirsiniz', 403);
    const su = await prisma.schoolUser.findFirst({ where: { id: input.schoolUserId, schoolId: ctx.schoolId }, select: { userId: true } });
    if (!su) throw new AppError('USER_NOT_FOUND', 'Kullanıcı bulunamadı', 404);
    await prisma.classroom.update({ where: { id: classroomId }, data: { adminUserId: su.userId } });
    logger.info('school.classroom.admin_assigned', { classroomId, schoolUserId: input.schoolUserId, actorId });
    return { ok: true };
  }
}

export class DeleteClassroomUseCase {
  async execute(classroomId: string, actorId?: string) {
    const ctx = await resolveSchoolContext(actorId);
    requireSchoolRole(ctx, 'SCHOOL_ADMIN', 'BRANCH_ADMIN');
    const classroom = await prisma.classroom.findFirst({ where: { id: classroomId, schoolId: ctx.schoolId }, select: { id: true, branchId: true, _count: { select: { students: true } } } });
    if (!classroom) throw new AppError('CLASSROOM_NOT_FOUND', 'Sınıf bulunamadı', 404);
    if (ctx.schoolRole === 'BRANCH_ADMIN' && ctx.branchId !== classroom.branchId)
      throw new AppError('FORBIDDEN_SCHOOL_ROLE', 'Yalnız kendi şubenizde işlem yapabilirsiniz', 403);
    if (classroom._count.students > 0) throw new AppError('CLASSROOM_NOT_EMPTY', 'Önce sınıftaki öğrencileri çıkarın', 409);
    await prisma.classroom.delete({ where: { id: classroomId } });
    logger.info('school.classroom.deleted', { classroomId, actorId });
    return { ok: true };
  }
}

/** Şube → Seviye → Sınıf ağacı (yöneticiler + öğrenci sayıları ile). */
export class GetSchoolTreeUseCase {
  async execute(actorId?: string) {
    const ctx = await resolveSchoolContext(actorId);
    requireSchoolRole(ctx, 'SCHOOL_ADMIN', 'BRANCH_ADMIN');
    const onlyBranch = ctx.schoolRole === 'BRANCH_ADMIN' ? (ctx.branchId ?? '__none__') : undefined;

    const branches = await prisma.branch.findMany({
      where: { schoolId: ctx.schoolId, ...(onlyBranch ? { id: onlyBranch } : {}) },
      orderBy: [{ createdAt: 'asc' }],
      include: {
        adminUser: { select: { id: true, username: true, firstName: true, lastName: true } },
        levels: {
          orderBy: [{ gradeLevel: 'asc' }],
          include: {
            adminUser: { select: { id: true, username: true, firstName: true, lastName: true } },
            classrooms: {
              orderBy: [{ name: 'asc' }],
              include: {
                adminUser: { select: { id: true, username: true, firstName: true, lastName: true } },
                _count: { select: { students: true } },
              },
            },
          },
        },
      },
    });

    const label = (u: { username: string; firstName: string | null; lastName: string | null } | null) =>
      u ? ([u.firstName, u.lastName].filter(Boolean).join(' ') || u.username) : null;

    return branches.map((b) => ({
      id: b.id,
      name: b.name,
      adminUserId: b.adminUserId,
      adminLabel: label(b.adminUser),
      levels: b.levels.map((l) => ({
        id: l.id,
        gradeLevel: l.gradeLevel,
        adminUserId: l.adminUserId,
        adminLabel: label(l.adminUser),
        classrooms: l.classrooms.map((c) => ({
          id: c.id,
          name: c.name,
          gradeLevel: c.gradeLevel,
          adminUserId: c.adminUserId,
          adminLabel: label(c.adminUser),
          studentCount: c._count.students,
        })),
      })),
    }));
  }
}

export class ListClassroomsUseCase {
  async execute(input: { branchId?: string }, actorId?: string) {
    const ctx = await resolveSchoolContext(actorId);
    requireSchoolRole(ctx, 'SCHOOL_ADMIN', 'BRANCH_ADMIN');
    const rows = await prisma.classroom.findMany({
      where: {
        schoolId: ctx.schoolId,
        ...(input.branchId ? { branchId: input.branchId } : {}),
        ...(ctx.schoolRole === 'BRANCH_ADMIN' ? { branchId: ctx.branchId ?? '__none__' } : {}),
      },
      orderBy: [{ gradeLevel: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { students: true } } },
    });
    return rows.map((c) => ({
      id: c.id,
      name: c.name,
      gradeLevel: c.gradeLevel,
      branchId: c.branchId,
      studentCount: c._count.students,
      createdAt: c.createdAt,
    }));
  }
}

/** Sınıfa öğrenci atar (SchoolUser.classroomId set). Öğrenciler aynı okuldan olmalı. */
export class AssignStudentsToClassroomUseCase {
  async execute(classroomId: string, input: { schoolUserIds: string[] }, actorId?: string) {
    const ctx = await resolveSchoolContext(actorId);
    requireSchoolRole(ctx, 'SCHOOL_ADMIN', 'BRANCH_ADMIN');
    const classroom = await prisma.classroom.findFirst({ where: { id: classroomId, schoolId: ctx.schoolId }, select: { id: true, branchId: true } });
    if (!classroom) throw new AppError('CLASSROOM_NOT_FOUND', 'Sınıf bulunamadı', 404);

    const ids = [...new Set(input.schoolUserIds ?? [])];
    if (ids.length === 0) throw new AppError('NO_STUDENTS', 'En az bir öğrenci seçin', 400);

    const valid = await prisma.schoolUser.findMany({
      where: { id: { in: ids }, schoolId: ctx.schoolId, schoolRole: 'STUDENT' as any },
      select: { id: true },
    });
    if (valid.length === 0) throw new AppError('NO_VALID_STUDENTS', 'Geçerli öğrenci bulunamadı', 400);

    const res = await prisma.schoolUser.updateMany({
      where: { id: { in: valid.map((v) => v.id) } },
      data: { classroomId, branchId: classroom.branchId },
    });
    logger.info('school.classroom.students_assigned', { classroomId, count: res.count, actorId });
    return { assigned: res.count };
  }
}

// ── Zümre ──────────────────────────────────────────────────────────────────
export class CreateDepartmentUseCase {
  async execute(input: { name: string; subject: string }, actorId?: string) {
    const ctx = await resolveSchoolContext(actorId);
    requireSchoolRole(ctx, 'SCHOOL_ADMIN');
    const name = (input.name ?? '').trim();
    const subject = (input.subject ?? '').trim();
    if (!name) throw new AppError('NAME_REQUIRED', 'Zümre adı zorunlu', 400);
    if (!subject) throw new AppError('SUBJECT_REQUIRED', 'Ders adı zorunlu', 400);
    const created = await prisma.department.create({ data: { schoolId: ctx.schoolId, name, subject } });
    logger.info('school.department.created', { id: created.id, actorId });
    return created;
  }
}

export class ListDepartmentsUseCase {
  async execute(actorId?: string) {
    const ctx = await resolveSchoolContext(actorId);
    requireSchoolRole(ctx, 'SCHOOL_ADMIN', 'BRANCH_ADMIN', 'DEPT_HEAD', 'TEACHER');
    const rows = await prisma.department.findMany({
      where: { schoolId: ctx.schoolId },
      orderBy: [{ name: 'asc' }],
      include: {
        headUser: { select: { id: true, username: true } },
        _count: { select: { members: true } },
      },
    });
    return rows.map((d) => ({
      id: d.id,
      name: d.name,
      subject: d.subject,
      headUsername: d.headUser?.username ?? null,
      memberCount: d._count.members,
      createdAt: d.createdAt,
    }));
  }
}

/** Zümreye öğretmen atar; biri başkan yapılabilir (headUserId + DEPT_HEAD). */
export class AssignDepartmentMembersUseCase {
  async execute(departmentId: string, input: { schoolUserIds: string[]; headSchoolUserId?: string }, actorId?: string) {
    const ctx = await resolveSchoolContext(actorId);
    requireSchoolRole(ctx, 'SCHOOL_ADMIN');
    const dept = await prisma.department.findFirst({ where: { id: departmentId, schoolId: ctx.schoolId }, select: { id: true } });
    if (!dept) throw new AppError('DEPARTMENT_NOT_FOUND', 'Zümre bulunamadı', 404);

    const ids = [...new Set(input.schoolUserIds ?? [])];
    if (ids.length === 0) throw new AppError('NO_MEMBERS', 'En az bir öğretmen seçin', 400);
    const valid = await prisma.schoolUser.findMany({
      where: { id: { in: ids }, schoolId: ctx.schoolId, schoolRole: { in: ['TEACHER', 'DEPT_HEAD'] as any } },
      select: { id: true, userId: true },
    });
    if (valid.length === 0) throw new AppError('NO_VALID_MEMBERS', 'Geçerli öğretmen bulunamadı', 400);

    await prisma.$transaction(async (tx) => {
      await tx.schoolUser.updateMany({ where: { id: { in: valid.map((v) => v.id) } }, data: { departmentId } });
      if (input.headSchoolUserId) {
        const head = valid.find((v) => v.id === input.headSchoolUserId);
        if (!head) throw new AppError('INVALID_HEAD', 'Başkan, atanan öğretmenlerden olmalı', 400);
        await tx.schoolUser.update({ where: { id: head.id }, data: { schoolRole: 'DEPT_HEAD' as any } });
        await tx.department.update({ where: { id: departmentId }, data: { headUserId: head.userId } });
      }
    });
    logger.info('school.department.members_assigned', { departmentId, count: valid.length, actorId });
    return { assigned: valid.length };
  }
}

// ── Kota ──────────────────────────────────────────────────────────────────
export class GetSchoolQuotaUseCase {
  async execute(actorId?: string) {
    const ctx = await resolveSchoolContext(actorId);
    requireSchoolRole(ctx, 'SCHOOL_ADMIN', 'BRANCH_ADMIN');
    const school = await prisma.school.findUnique({
      where: { id: ctx.schoolId },
      select: { maxUsers: true, annualLiveLimit: true, usedLiveCount: true },
    });
    if (!school) throw new AppError('SCHOOL_NOT_FOUND', 'Okul bulunamadı', 404);
    const userCount = await prisma.schoolUser.count({ where: { schoolId: ctx.schoolId, isActive: true } });
    return {
      maxUsers: school.maxUsers,
      usedUsers: userCount,
      remainingUsers: Math.max(0, school.maxUsers - userCount),
      annualLiveLimit: school.annualLiveLimit,
      usedLiveCount: school.usedLiveCount,
      remainingLive: Math.max(0, school.annualLiveLimit - school.usedLiveCount),
    };
  }
}
