/**
 * E-Sınıf — Okul Yöneticisi organizasyon use-case'leri (Sprint 1):
 * Şube / Sınıf / Zümre CRUD + öğrenci-öğretmen atama + kota.
 * Hepsi resolveSchoolContext ile okul bağlamına kilitlenir (tenant + schoolId izolasyonu).
 */
import { prisma } from '../../../infrastructure/database/prisma';
import { AppError } from '../../errors/AppError';
import { logger } from '../../../infrastructure/logger/logger';
import { resolveSchoolContext, requireSchoolRole, resolveSchoolScope, scopeIsEmpty, scopedClassroomWhere, isManagerForBranch } from './schoolHelpers';

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
    const name = (input.name ?? '').trim();
    if (!name) throw new AppError('NAME_REQUIRED', 'Sınıf adı zorunlu', 400);

    const level = await prisma.schoolLevel.findFirst({
      where: { id: input.levelId, schoolId: ctx.schoolId },
      select: { id: true, branchId: true, gradeLevel: true, adminUserId: true },
    });
    if (!level) throw new AppError('LEVEL_NOT_FOUND', 'Seviye bulunamadı', 404);
    // Yetki: okul/şube yöneticisi veya bu seviyenin sorumlusu (seviye sorumlusu).
    if (!isManagerForBranch(ctx, level.branchId) && level.adminUserId !== ctx.userId)
      throw new AppError('FORBIDDEN_SCHOOL_ROLE', 'Bu seviyeye sınıf ekleme yetkiniz yok', 403);

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
    const classroom = await prisma.classroom.findFirst({ where: { id: classroomId, schoolId: ctx.schoolId }, select: { id: true, branchId: true, level: { select: { adminUserId: true } } } });
    if (!classroom) throw new AppError('CLASSROOM_NOT_FOUND', 'Sınıf bulunamadı', 404);
    // Yetki: okul/şube yöneticisi veya bu sınıfın seviyesinin sorumlusu.
    if (!isManagerForBranch(ctx, classroom.branchId) && classroom.level?.adminUserId !== ctx.userId)
      throw new AppError('FORBIDDEN_SCHOOL_ROLE', 'Bu sınıfta işlem yetkiniz yok', 403);
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
    const classroom = await prisma.classroom.findFirst({ where: { id: classroomId, schoolId: ctx.schoolId }, select: { id: true, branchId: true, level: { select: { adminUserId: true } }, _count: { select: { students: true } } } });
    if (!classroom) throw new AppError('CLASSROOM_NOT_FOUND', 'Sınıf bulunamadı', 404);
    if (!isManagerForBranch(ctx, classroom.branchId) && classroom.level?.adminUserId !== ctx.userId)
      throw new AppError('FORBIDDEN_SCHOOL_ROLE', 'Bu sınıfta işlem yetkiniz yok', 403);
    if (classroom._count.students > 0) throw new AppError('CLASSROOM_NOT_EMPTY', 'Önce sınıftaki öğrencileri çıkarın', 409);
    await prisma.classroom.delete({ where: { id: classroomId } });
    logger.info('school.classroom.deleted', { classroomId, actorId });
    return { ok: true };
  }
}

/** Sınıfı pasife al / aktife al (soft — silme yerine). Öğrenciler ve veriler korunur. */
export class SetClassroomActiveUseCase {
  async execute(classroomId: string, input: { isActive: boolean }, actorId?: string) {
    const ctx = await resolveSchoolContext(actorId);
    const classroom = await prisma.classroom.findFirst({ where: { id: classroomId, schoolId: ctx.schoolId }, select: { id: true, branchId: true, level: { select: { adminUserId: true } } } });
    if (!classroom) throw new AppError('CLASSROOM_NOT_FOUND', 'Sınıf bulunamadı', 404);
    // Yetki: yönetici veya seviyenin sorumlusu (silme/atama ile aynı).
    if (!isManagerForBranch(ctx, classroom.branchId) && classroom.level?.adminUserId !== ctx.userId)
      throw new AppError('FORBIDDEN_SCHOOL_ROLE', 'Bu sınıfta işlem yetkiniz yok', 403);
    const updated = await prisma.classroom.update({ where: { id: classroomId }, data: { isActive: !!input.isActive } });
    logger.info('school.classroom.active_set', { classroomId, isActive: !!input.isActive, actorId });
    return { id: updated.id, isActive: updated.isActive };
  }
}

/** Şube → Seviye → Sınıf ağacı (yöneticiler + öğrenci sayıları ile). */
export class GetSchoolTreeUseCase {
  async execute(actorId?: string) {
    // Görüntüleme kapsamı — DESIGNATION tabanlı (zümre üyeliği org ağacı erişimi VERMEZ),
    // kimse hiyerarşide YUKARIYI görmez:
    //  - SCHOOL_ADMIN → tüm okul
    //  - BRANCH_ADMIN → kendi şubesi
    //  - Seviye Sorumlusu (SchoolLevel.adminUserId) → yalnız kendi seviye(ler)i
    //  - Sınıf Öğretmeni (Classroom.adminUserId) → yalnız kendi sınıf(lar)ı
    const ctx = await resolveSchoolContext(actorId);
    const schoolId = ctx.schoolId;
    const isSchoolAdmin = ctx.schoolRole === 'SCHOOL_ADMIN';

    const myLevels = isSchoolAdmin ? [] : await prisma.schoolLevel.findMany({ where: { schoolId, adminUserId: ctx.userId }, select: { id: true, branchId: true } });
    const myClasses = isSchoolAdmin ? [] : await prisma.classroom.findMany({ where: { schoolId, adminUserId: ctx.userId }, select: { id: true, branchId: true } });
    const fullBranchSet = new Set<string>();
    if (ctx.schoolRole === 'BRANCH_ADMIN' && ctx.branchId) fullBranchSet.add(ctx.branchId);
    const scope = {
      schoolId,
      wholeSchool: isSchoolAdmin,
      fullBranchIds: [...fullBranchSet],
      fullLevelIds: myLevels.map((l) => l.id),
      soloClassroomIds: myClasses.map((c) => c.id),
    };

    // Kapsamdaki şubeleri belirle (tam şube + tam seviyelerin şubesi + tekil sınıfların şubesi)
    let branchIdFilter: string[] | null = null;
    if (!scope.wholeSchool) {
      const ids = new Set<string>(fullBranchSet);
      myLevels.forEach((l) => l.branchId && ids.add(l.branchId));
      myClasses.forEach((c) => c.branchId && ids.add(c.branchId));
      if (!ids.size) return [];
      branchIdFilter = [...ids];
    }

    const branches = await prisma.branch.findMany({
      where: { schoolId: scope.schoolId, ...(branchIdFilter ? { id: { in: branchIdFilter } } : {}) },
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
    const fullBranch = new Set(scope.fullBranchIds);
    const fullLevel = new Set(scope.fullLevelIds);
    const solo = new Set(scope.soloClassroomIds);

    const out = [];
    for (const b of branches) {
      const branchAll = scope.wholeSchool || fullBranch.has(b.id);
      const levels = [];
      for (const l of b.levels) {
        const levelAll = branchAll || fullLevel.has(l.id);
        const classrooms = (levelAll ? l.classrooms : l.classrooms.filter((c) => solo.has(c.id)));
        if (!levelAll && classrooms.length === 0) continue; // kapsam dışı seviye
        levels.push({
          id: l.id,
          gradeLevel: l.gradeLevel,
          adminUserId: l.adminUserId,
          adminLabel: label(l.adminUser),
          classrooms: classrooms.map((c) => ({
            id: c.id,
            name: c.name,
            gradeLevel: c.gradeLevel,
            isActive: c.isActive,
            adminUserId: c.adminUserId,
            adminLabel: label(c.adminUser),
            studentCount: c._count.students,
          })),
        });
      }
      if (!branchAll && levels.length === 0) continue; // kapsam dışı şube
      out.push({ id: b.id, name: b.name, adminUserId: b.adminUserId, adminLabel: label(b.adminUser), levels });
    }
    return out;
  }
}

export class ListClassroomsUseCase {
  async execute(input: { branchId?: string }, actorId?: string) {
    const ctx = await resolveSchoolContext(actorId);
    // Rol-kapsamlı: yöneticiler tüm okul/şube; öğretmen/zümre başkanı/seviye sorumlusu/
    // sınıf öğretmeni yetki alanındaki sınıfları görür (ödev atama bu listeyi kullanır).
    const isManager = ctx.schoolRole === 'SCHOOL_ADMIN' || ctx.schoolRole === 'BRANCH_ADMIN';
    let where: Record<string, unknown>;
    if (isManager) {
      where = {
        schoolId: ctx.schoolId,
        ...(input.branchId ? { branchId: input.branchId } : {}),
        ...(ctx.schoolRole === 'BRANCH_ADMIN' ? { branchId: ctx.branchId ?? '__none__' } : {}),
      };
    } else {
      const scope = await resolveSchoolScope(actorId);
      if (scopeIsEmpty(scope)) return [];
      const scoped = scopedClassroomWhere(scope);
      where = input.branchId ? { AND: [scoped, { branchId: input.branchId }] } : scoped;
    }
    const rows = await prisma.classroom.findMany({
      where,
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
    const classroom = await prisma.classroom.findFirst({ where: { id: classroomId, schoolId: ctx.schoolId }, select: { id: true, branchId: true, adminUserId: true, level: { select: { adminUserId: true } } } });
    if (!classroom) throw new AppError('CLASSROOM_NOT_FOUND', 'Sınıf bulunamadı', 404);
    // Yetki: yönetici, sınıf öğretmeni (kendi sınıfı) veya seviyenin sorumlusu.
    if (!isManagerForBranch(ctx, classroom.branchId) && classroom.adminUserId !== ctx.userId && classroom.level?.adminUserId !== ctx.userId)
      throw new AppError('FORBIDDEN_SCHOOL_ROLE', 'Bu sınıfta işlem yetkiniz yok', 403);

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

/** Sınıftan öğrenci çıkarır (classroomId null). Yalnız bu sınıftaki öğrenciler etkilenir. */
export class RemoveStudentsFromClassroomUseCase {
  async execute(classroomId: string, input: { schoolUserIds: string[] }, actorId?: string) {
    const ctx = await resolveSchoolContext(actorId);
    const classroom = await prisma.classroom.findFirst({ where: { id: classroomId, schoolId: ctx.schoolId }, select: { id: true, branchId: true, adminUserId: true, level: { select: { adminUserId: true } } } });
    if (!classroom) throw new AppError('CLASSROOM_NOT_FOUND', 'Sınıf bulunamadı', 404);
    // Yetki: yönetici, sınıf öğretmeni (kendi sınıfı) veya seviyenin sorumlusu (atama ile aynı).
    if (!isManagerForBranch(ctx, classroom.branchId) && classroom.adminUserId !== ctx.userId && classroom.level?.adminUserId !== ctx.userId)
      throw new AppError('FORBIDDEN_SCHOOL_ROLE', 'Bu sınıfta işlem yetkiniz yok', 403);

    const ids = [...new Set(input.schoolUserIds ?? [])];
    if (ids.length === 0) throw new AppError('NO_STUDENTS', 'En az bir öğrenci seçin', 400);

    // Yalnız gerçekten bu sınıfta olan öğrenciler çıkarılır (başka sınıfı etkilemez).
    const res = await prisma.schoolUser.updateMany({
      where: { id: { in: ids }, schoolId: ctx.schoolId, classroomId, schoolRole: 'STUDENT' as any },
      data: { classroomId: null },
    });
    logger.info('school.classroom.students_removed', { classroomId, count: res.count, actorId });
    return { removed: res.count };
  }
}

// ── Zümre ──────────────────────────────────────────────────────────────────
export class CreateDepartmentUseCase {
  /**
   * Kapsam: levelId verilirse seviyeye özel; yoksa branchId verilirse şube geneli;
   * ikisi de yoksa tüm okul (genel). branchId, seviyeden türetilir.
   */
  async execute(input: { name: string; subject: string; levelId?: string | null; branchId?: string | null }, actorId?: string) {
    const ctx = await resolveSchoolContext(actorId);
    requireSchoolRole(ctx, 'SCHOOL_ADMIN', 'BRANCH_ADMIN');
    const name = (input.name ?? '').trim();
    const subject = (input.subject ?? '').trim();
    if (!name) throw new AppError('NAME_REQUIRED', 'Zümre adı zorunlu', 400);
    if (!subject) throw new AppError('SUBJECT_REQUIRED', 'Ders adı zorunlu', 400);

    let branchId: string | null = null;
    let levelId: string | null = null;
    if (input.levelId) {
      const level = await prisma.schoolLevel.findFirst({ where: { id: input.levelId, schoolId: ctx.schoolId }, select: { id: true, branchId: true } });
      if (!level) throw new AppError('LEVEL_NOT_FOUND', 'Seviye bulunamadı', 404);
      branchId = level.branchId;
      levelId = level.id;
    } else if (input.branchId) {
      const branch = await prisma.branch.findFirst({ where: { id: input.branchId, schoolId: ctx.schoolId }, select: { id: true } });
      if (!branch) throw new AppError('BRANCH_NOT_FOUND', 'Şube bulunamadı', 404);
      branchId = branch.id;
    }
    // Şube yöneticisi yalnız kendi şubesinde; tüm-okul (genel) zümre açamaz.
    if (ctx.schoolRole === 'BRANCH_ADMIN' && (!branchId || branchId !== ctx.branchId)) {
      throw new AppError('FORBIDDEN_SCHOOL_ROLE', 'Yalnız kendi şubenizde zümre açabilirsiniz', 403);
    }

    const created = await prisma.department.create({ data: { schoolId: ctx.schoolId, branchId, levelId, name, subject } });
    logger.info('school.department.created', { id: created.id, branchId, levelId, actorId });
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
        level: { select: { gradeLevel: true } },
        branch: { select: { name: true } },
        _count: { select: { members: true } },
      },
    });
    return rows.map((d) => ({
      id: d.id,
      name: d.name,
      subject: d.subject,
      // Kapsam etiketi (dropdown'larda ayırt etmek için)
      scope: d.levelId ? 'LEVEL' : d.branchId ? 'BRANCH' : 'SCHOOL',
      gradeLevel: d.level?.gradeLevel ?? null,
      branchName: d.branch?.name ?? null,
      headUsername: d.headUser?.username ?? null,
      memberCount: d._count.members,
      createdAt: d.createdAt,
    }));
  }
}

/** Zümre ağacı: Tüm Okul (genel) + her Şube (şube geneli zümreler) → her Seviye (seviyeye özel). */
export class GetDepartmentTreeUseCase {
  async execute(actorId?: string) {
    // Görüntüleme kapsamı — kimse hiyerarşide YUKARIYI görmez:
    //  - SCHOOL_ADMIN  → tüm okul
    //  - BRANCH_ADMIN  → yalnız kendi şubesinin zümreleri (okul-geneli HARİÇ)
    //  - Seviye Sorumlusu (SchoolLevel.adminUserId) → yalnız kendi seviye(ler)inin zümreleri
    //  - Öğretmen / Zümre Başkanı → yalnız üyesi/başkanı olduğu zümre(ler)
    const ctx = await resolveSchoolContext(actorId);
    const schoolId = ctx.schoolId;
    const isSchoolAdmin = ctx.schoolRole === 'SCHOOL_ADMIN';

    let deptWhere: Record<string, unknown>;
    if (isSchoolAdmin) {
      deptWhere = { schoolId };
    } else {
      const or: Array<Record<string, unknown>> = [];
      if (ctx.schoolRole === 'BRANCH_ADMIN' && ctx.branchId) or.push({ branchId: ctx.branchId });
      const myLevels = await prisma.schoolLevel.findMany({ where: { schoolId, adminUserId: ctx.userId }, select: { id: true } });
      if (myLevels.length) or.push({ levelId: { in: myLevels.map((l) => l.id) } });
      const myDeptIds = new Set<string>();
      if (ctx.departmentId) myDeptIds.add(ctx.departmentId);
      const headed = await prisma.department.findMany({ where: { schoolId, headUserId: ctx.userId }, select: { id: true } });
      headed.forEach((d) => myDeptIds.add(d.id));
      if (myDeptIds.size) or.push({ id: { in: [...myDeptIds] } });
      if (or.length === 0) return { schoolWide: [], branches: [] };
      deptWhere = { schoolId, OR: or };
    }

    const depts = await prisma.department.findMany({
      where: deptWhere,
      orderBy: [{ subject: 'asc' }, { name: 'asc' }],
      include: {
        headUser: { select: { username: true, firstName: true, lastName: true } },
        members: { select: { username: true, user: { select: { firstName: true, lastName: true } } }, orderBy: [{ username: 'asc' }] },
        _count: { select: { members: true } },
      },
    });

    const label = (u: { username: string; firstName: string | null; lastName: string | null } | null) =>
      u ? ([u.firstName, u.lastName].filter(Boolean).join(' ') || u.username) : null;
    const map = (d: (typeof depts)[number]) => ({
      id: d.id, name: d.name, subject: d.subject, headUserId: d.headUserId, headLabel: label(d.headUser),
      memberCount: d._count.members,
      // Salt-okuma üye adları (herkes görebilir; müdahale yetkisi ayrı).
      members: (d.members ?? []).map((m) => ([m.user?.firstName, m.user?.lastName].filter(Boolean).join(' ') || m.username)),
    });

    // Tree yalnız görünür zümrelerin bulunduğu şube/seviyeleri içerir (üst düğümler boş gelmez).
    const byBranch = new Map<string, ReturnType<typeof map>[]>();
    const byLevel = new Map<string, ReturnType<typeof map>[]>();
    const schoolWide: ReturnType<typeof map>[] = [];
    const shownBranchIds = new Set<string>();
    for (const d of depts) {
      const m = map(d);
      if (d.levelId) { const a = byLevel.get(d.levelId) ?? []; a.push(m); byLevel.set(d.levelId, a); if (d.branchId) shownBranchIds.add(d.branchId); }
      else if (d.branchId) { const a = byBranch.get(d.branchId) ?? []; a.push(m); byBranch.set(d.branchId, a); shownBranchIds.add(d.branchId); }
      else schoolWide.push(m);
    }

    // Yöneticiler TÜM yapıyı görür (boş seviyelere de zümre eklenebilsin); alt roller
    // yalnız zümresi olan düğümleri. Sınıf YOK (zümre ağacı yalnız şube→seviye).
    const isBranchAdmin = ctx.schoolRole === 'BRANCH_ADMIN';
    const showFullStructure = isSchoolAdmin || isBranchAdmin;
    const branchWhere = isSchoolAdmin
      ? { schoolId }
      : isBranchAdmin
        ? { schoolId, id: ctx.branchId ?? '__none__' }
        : { schoolId, id: { in: shownBranchIds.size ? [...shownBranchIds] : ['__none__'] } };
    const branches = await prisma.branch.findMany({
      where: branchWhere,
      orderBy: [{ createdAt: 'asc' }],
      include: { levels: { orderBy: [{ gradeLevel: 'asc' }] } },
    });

    return {
      schoolWide, // yalnız tüm-okul kapsamında (admin) veya kendi okul-geneli zümresinde dolu
      branches: branches.map((b) => {
        const levels = (showFullStructure ? b.levels : b.levels.filter((l) => byLevel.has(l.id)))
          .map((l) => ({ id: l.id, gradeLevel: l.gradeLevel, departments: byLevel.get(l.id) ?? [] }));
        return { id: b.id, name: b.name, departments: byBranch.get(b.id) ?? [], levels };
      }),
    };
  }
}

export class DeleteDepartmentUseCase {
  async execute(departmentId: string, actorId?: string) {
    const ctx = await resolveSchoolContext(actorId);
    requireSchoolRole(ctx, 'SCHOOL_ADMIN', 'BRANCH_ADMIN');
    const dept = await prisma.department.findFirst({ where: { id: departmentId, schoolId: ctx.schoolId }, select: { id: true, branchId: true, _count: { select: { members: true } } } });
    if (!dept) throw new AppError('DEPARTMENT_NOT_FOUND', 'Zümre bulunamadı', 404);
    if (ctx.schoolRole === 'BRANCH_ADMIN' && dept.branchId !== ctx.branchId) throw new AppError('FORBIDDEN_SCHOOL_ROLE', 'Yalnız kendi şubenizde işlem yapabilirsiniz', 403);
    if (dept._count.members > 0) throw new AppError('DEPARTMENT_NOT_EMPTY', 'Önce zümredeki öğretmenleri çıkarın', 409);
    await prisma.department.delete({ where: { id: departmentId } });
    logger.info('school.department.deleted', { departmentId, actorId });
    return { ok: true };
  }
}

/** Zümre öğretmen adayları + mevcut durum (atama diyaloğunu önceden işaretlemek için). */
export class GetDepartmentMembersUseCase {
  async execute(departmentId: string, actorId?: string) {
    const ctx = await resolveSchoolContext(actorId);
    const dept = await prisma.department.findFirst({ where: { id: departmentId, schoolId: ctx.schoolId }, select: { id: true, branchId: true, headUserId: true } });
    if (!dept) throw new AppError('DEPARTMENT_NOT_FOUND', 'Zümre bulunamadı', 404);
    // Yetki: yönetici veya bu zümrenin başkanı (aday listesini görebilsin).
    if (!isManagerForBranch(ctx, dept.branchId) && dept.headUserId !== ctx.userId)
      throw new AppError('FORBIDDEN_SCHOOL_ROLE', 'Bu zümrede işlem yetkiniz yok', 403);

    const teachers = await prisma.schoolUser.findMany({
      where: { schoolId: ctx.schoolId, schoolRole: { in: ['TEACHER', 'DEPT_HEAD'] as any } },
      select: { id: true, userId: true, username: true, departmentId: true, user: { select: { firstName: true, lastName: true } }, department: { select: { name: true } } },
      orderBy: [{ username: 'asc' }],
    });
    return {
      candidates: teachers.map((t) => ({
        id: t.id,
        username: t.username,
        fullName: [t.user?.firstName, t.user?.lastName].filter(Boolean).join(' ') || null,
        inDept: t.departmentId === departmentId,
        isHead: !!dept.headUserId && t.userId === dept.headUserId,
        otherDept: t.departmentId && t.departmentId !== departmentId ? (t.department?.name ?? null) : null,
      })),
    };
  }
}

/**
 * Zümre üyelerini SENKRONLAR (güncelle semantiği): istenen tam küme dışındakiler çıkarılır,
 * istenenler eklenir/korunur; başkan ayarlanır/temizlenir. Boş küme → tüm üyeler çıkar.
 */
export class AssignDepartmentMembersUseCase {
  async execute(departmentId: string, input: { schoolUserIds: string[]; headSchoolUserId?: string | null }, actorId?: string) {
    const ctx = await resolveSchoolContext(actorId);
    const dept = await prisma.department.findFirst({ where: { id: departmentId, schoolId: ctx.schoolId }, select: { id: true, branchId: true, headUserId: true } });
    if (!dept) throw new AppError('DEPARTMENT_NOT_FOUND', 'Zümre bulunamadı', 404);
    // Yetki: yönetici veya bu zümrenin başkanı (kendi zümresi).
    if (!isManagerForBranch(ctx, dept.branchId) && dept.headUserId !== ctx.userId)
      throw new AppError('FORBIDDEN_SCHOOL_ROLE', 'Bu zümrede işlem yetkiniz yok', 403);

    const desiredIds = [...new Set(input.schoolUserIds ?? [])];
    const valid = desiredIds.length
      ? await prisma.schoolUser.findMany({
          where: { id: { in: desiredIds }, schoolId: ctx.schoolId, schoolRole: { in: ['TEACHER', 'DEPT_HEAD'] as any } },
          select: { id: true, userId: true },
        })
      : [];
    if (valid.length !== desiredIds.length) throw new AppError('INVALID_MEMBERS', 'Geçersiz öğretmen seçimi', 400);
    const validById = new Map(valid.map((v) => [v.id, v.userId]));

    let headUserId: string | null = null;
    if (input.headSchoolUserId) {
      if (!validById.has(input.headSchoolUserId)) throw new AppError('INVALID_HEAD', 'Başkan, atanan öğretmenlerden olmalı', 400);
      headUserId = validById.get(input.headSchoolUserId) ?? null;
    }

    const current = await prisma.schoolUser.findMany({ where: { schoolId: ctx.schoolId, departmentId }, select: { id: true } });
    const desiredSet = new Set(desiredIds);
    const toRemove = current.map((c) => c.id).filter((id) => !desiredSet.has(id));

    await prisma.$transaction(async (tx) => {
      // Çıkarılanlar: zümreden ayır; başkan rolündeyse öğretmene indir
      if (toRemove.length) {
        await tx.schoolUser.updateMany({ where: { id: { in: toRemove } }, data: { departmentId: null } });
        await tx.schoolUser.updateMany({ where: { id: { in: toRemove }, schoolRole: 'DEPT_HEAD' as any }, data: { schoolRole: 'TEACHER' as any } });
      }
      // Eklenen/korunan: zümreye bağla
      if (desiredIds.length) {
        await tx.schoolUser.updateMany({ where: { id: { in: desiredIds } }, data: { departmentId } });
      }
      // Başkan: önce bu zümredeki tüm DEPT_HEAD'leri öğretmene indir, sonra seçileni başkan yap
      await tx.schoolUser.updateMany({ where: { departmentId, schoolRole: 'DEPT_HEAD' as any }, data: { schoolRole: 'TEACHER' as any } });
      if (input.headSchoolUserId) {
        await tx.schoolUser.update({ where: { id: input.headSchoolUserId }, data: { schoolRole: 'DEPT_HEAD' as any } });
      }
      await tx.department.update({ where: { id: departmentId }, data: { headUserId } });
    });
    logger.info('school.department.members_synced', { departmentId, members: desiredIds.length, removed: toRemove.length, head: !!headUserId, actorId });
    return { assigned: desiredIds.length, removed: toRemove.length };
  }
}

// ── Ders havuzu ──────────────────────────────────────────────────────────────
export class CreateSubjectUseCase {
  async execute(input: { name: string }, actorId?: string) {
    const ctx = await resolveSchoolContext(actorId);
    requireSchoolRole(ctx, 'SCHOOL_ADMIN');
    const name = (input.name ?? '').trim();
    if (!name) throw new AppError('NAME_REQUIRED', 'Ders adı zorunlu', 400);
    const clash = await prisma.schoolSubject.findUnique({ where: { schoolId_name: { schoolId: ctx.schoolId, name } }, select: { id: true } });
    if (clash) throw new AppError('SUBJECT_EXISTS', 'Bu ders zaten ekli', 409);
    const created = await prisma.schoolSubject.create({ data: { schoolId: ctx.schoolId, name } });
    logger.info('school.subject.created', { id: created.id, actorId });
    return { id: created.id, name: created.name };
  }
}

export class ListSubjectsUseCase {
  async execute(actorId?: string) {
    const ctx = await resolveSchoolContext(actorId);
    requireSchoolRole(ctx, 'SCHOOL_ADMIN', 'BRANCH_ADMIN', 'DEPT_HEAD', 'TEACHER');
    return prisma.schoolSubject.findMany({ where: { schoolId: ctx.schoolId }, orderBy: [{ name: 'asc' }], select: { id: true, name: true } });
  }
}

/** Okul içindeki seviye listesi (sınıf seviyeleri 1-12, tekilleştirilmiş) — sınav formu dropdown'u. */
export class ListSchoolLevelsUseCase {
  async execute(actorId?: string) {
    const ctx = await resolveSchoolContext(actorId);
    requireSchoolRole(ctx, 'SCHOOL_ADMIN', 'BRANCH_ADMIN', 'DEPT_HEAD', 'TEACHER');
    const rows = await prisma.schoolLevel.findMany({ where: { schoolId: ctx.schoolId }, select: { gradeLevel: true } });
    const distinct = [...new Set(rows.map((r) => r.gradeLevel))].sort((a, b) => a - b);
    return distinct.map((gradeLevel) => ({ gradeLevel }));
  }
}

/** Admin Konu (Topic) listesi — okul personeli sınav formunda konu seçer. Topic global'dir. */
export class ListSchoolTopicsUseCase {
  async execute(actorId?: string) {
    const ctx = await resolveSchoolContext(actorId);
    requireSchoolRole(ctx, 'SCHOOL_ADMIN', 'BRANCH_ADMIN', 'DEPT_HEAD', 'TEACHER');
    return prisma.topic.findMany({ where: { active: true }, orderBy: [{ name: 'asc' }], select: { id: true, name: true } });
  }
}

export class DeleteSubjectUseCase {
  async execute(id: string, actorId?: string) {
    const ctx = await resolveSchoolContext(actorId);
    requireSchoolRole(ctx, 'SCHOOL_ADMIN');
    const subj = await prisma.schoolSubject.findFirst({ where: { id, schoolId: ctx.schoolId }, select: { id: true } });
    if (!subj) throw new AppError('SUBJECT_NOT_FOUND', 'Ders bulunamadı', 404);
    await prisma.schoolSubject.delete({ where: { id } });
    logger.info('school.subject.deleted', { id, actorId });
    return { ok: true };
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

/** Okul paneli özet sayıları (kartlarda gösterilir). Okul-geneli; herhangi bir okul kullanıcısı. */
export class GetSchoolPanelStatsUseCase {
  async execute(actorId?: string) {
    const ctx = await resolveSchoolContext(actorId);
    const schoolId = ctx.schoolId;
    const [branches, levels, classrooms, departments, subjects, teachers, students, assignments, exams, liveSessions] = await Promise.all([
      prisma.branch.count({ where: { schoolId } }),
      prisma.schoolLevel.count({ where: { schoolId } }),
      prisma.classroom.count({ where: { schoolId } }),
      prisma.department.count({ where: { schoolId } }),
      prisma.schoolSubject.count({ where: { schoolId } }),
      prisma.schoolUser.count({ where: { schoolId, isActive: true, schoolRole: { in: ['TEACHER', 'DEPT_HEAD', 'BRANCH_ADMIN'] as any } } }),
      prisma.schoolUser.count({ where: { schoolId, isActive: true, schoolRole: 'STUDENT' as any } }),
      prisma.schoolAssignment.count({ where: { schoolId } }),
      prisma.schoolExam.count({ where: { schoolId, isArchived: false } }),
      prisma.liveSession.count({ where: { schoolId } }),
    ]);
    return { branches, levels, classrooms, departments, subjects, teachers, students, users: teachers + students, assignments, exams, liveSessions };
  }
}
