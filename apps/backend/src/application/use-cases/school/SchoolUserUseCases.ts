/**
 * E-Sınıf — Okul Yöneticisi kullanıcı yönetimi (Sprint 1):
 * Kullanıcı ekleme (otomatik username + geçici şifre + kota), listeleme,
 * pasifleştirme, şifre sıfırlama. Tümü okul bağlamına kilitli.
 */
import * as bcrypt from 'bcryptjs';
import { prisma } from '../../../infrastructure/database/prisma';
import { AppError } from '../../errors/AppError';
import { logger } from '../../../infrastructure/logger/logger';
import { resolveSchoolContext, requireSchoolRole, isManagerForBranch, resolveSchoolScope, scopeIsEmpty, nextSchoolUsername, generateTempPassword, currentPeriodId, resolvePeriodFilter, schoolAudit, type SchoolRoleStr } from './schoolHelpers';

const ASSIGNABLE: SchoolRoleStr[] = ['BRANCH_ADMIN', 'DEPT_HEAD', 'TEACHER', 'STUDENT'];

/**
 * Yeni okul kullanıcısı oluşturur: User + SchoolUser. Username otomatik
 * (KOD-ROL-0000, race-safe), geçici şifre üretilir ve TEK SEFER döner.
 * Kota (School.maxUsers) aşılırsa hata. SCHOOL_ADMIN buradan oluşturulamaz
 * (o platform admin'in AssignSchoolAdmin akışından gelir).
 */
export class CreateSchoolUserUseCase {
  async execute(
    input: { schoolRole: string; firstName?: string; lastName?: string; branchId?: string; classroomId?: string; departmentId?: string },
    actorId?: string,
  ): Promise<{ schoolUserId: string; username: string; tempPassword: string; schoolRole: string }> {
    const ctx = await resolveSchoolContext(actorId);
    requireSchoolRole(ctx, 'SCHOOL_ADMIN');

    const role = input.schoolRole as SchoolRoleStr;
    if (!ASSIGNABLE.includes(role)) throw new AppError('INVALID_ROLE', 'Geçersiz okul rolü', 400);
    // Öğrenciler bu akıştan değil, sınıf sayfasından Excel ile toplu eklenir.
    if (role === 'STUDENT') throw new AppError('STUDENT_VIA_IMPORT', 'Öğrenciler sınıf sayfasından Excel ile eklenir', 400);

    const school = await prisma.school.findUnique({ where: { id: ctx.schoolId }, select: { id: true, code: true, tenantId: true, maxUsers: true } });
    if (!school) throw new AppError('SCHOOL_NOT_FOUND', 'Okul bulunamadı', 404);

    // Kota kontrolü (aktif kullanıcı sayısı)
    const activeCount = await prisma.schoolUser.count({ where: { schoolId: ctx.schoolId, isActive: true } });
    if (school.maxUsers > 0 && activeCount >= school.maxUsers) {
      throw new AppError('USER_QUOTA_EXCEEDED', 'Okul kullanıcı kotası dolu', 409);
    }

    // İlişkili varlık doğrulamaları (aynı okul)
    if (input.branchId) {
      const b = await prisma.branch.findFirst({ where: { id: input.branchId, schoolId: ctx.schoolId }, select: { id: true } });
      if (!b) throw new AppError('BRANCH_NOT_FOUND', 'Şube bulunamadı', 404);
    }
    if (input.classroomId) {
      const c = await prisma.classroom.findFirst({ where: { id: input.classroomId, schoolId: ctx.schoolId }, select: { id: true, branchId: true } });
      if (!c) throw new AppError('CLASSROOM_NOT_FOUND', 'Sınıf bulunamadı', 404);
    }
    if (input.departmentId) {
      const d = await prisma.department.findFirst({ where: { id: input.departmentId, schoolId: ctx.schoolId }, select: { id: true } });
      if (!d) throw new AppError('DEPARTMENT_NOT_FOUND', 'Zümre bulunamadı', 404);
    }

    const tempPassword = generateTempPassword();
    const passwordHash = await bcrypt.hash(tempPassword, 12);

    const result = await prisma.$transaction(async (tx) => {
      const username = await nextSchoolUsername(tx, ctx.schoolId, school.code, role);
      const user = await tx.user.create({
        data: {
          email: `${username.toLowerCase()}@esinif.local`,
          username,
          firstName: (input.firstName ?? '').trim() || null,
          lastName: (input.lastName ?? '').trim() || null,
          passwordHash,
          role: 'CANDIDATE',
          status: 'ACTIVE',
          emailVerified: true,
          tenantId: school.tenantId,
          metadata: { schoolUser: true } as object,
        },
      });
      const su = await tx.schoolUser.create({
        data: {
          userId: user.id,
          schoolId: ctx.schoolId,
          schoolRole: role as any,
          username,
          // Öğrenci bu akıştan oluşturulmaz (Excel ile); yalnız öğretmen ve üstü.
          branchId: role === 'BRANCH_ADMIN' ? input.branchId ?? null : null,
          departmentId: role === 'TEACHER' || role === 'DEPT_HEAD' ? input.departmentId ?? null : null,
        },
      });
      return { schoolUserId: su.id, username };
    });

    logger.info('school.user.created', { schoolUserId: result.schoolUserId, role, schoolId: ctx.schoolId, actorId });
    schoolAudit(ctx, { action: 'SCHOOL_USER_CREATED', entityType: 'SchoolUser', entityId: result.schoolUserId, metadata: { role, username: result.username } });
    return { schoolUserId: result.schoolUserId, username: result.username, tempPassword, schoolRole: role };
  }
}

const MAX_BULK_STUDENTS = 300;

/**
 * Excel içe aktarımı — bir sınıfa toplu ÖĞRENCI oluşturur (Ad + Soyad).
 * Her öğrenci: User + SchoolUser(STUDENT), otomatik username + geçici şifre.
 * Şifreler TEK SEFER döner (liste görüntüleme için). Kota (maxUsers) aşılırsa hata.
 */
export class BulkCreateStudentsUseCase {
  async execute(
    classroomId: string,
    input: { students: Array<{ firstName?: string; lastName?: string; studentNo?: string }> },
    actorId?: string,
  ): Promise<{ count: number; created: Array<{ name: string; username: string; studentNo: string | null; tempPassword: string }> }> {
    const ctx = await resolveSchoolContext(actorId);

    const school = await prisma.school.findUnique({ where: { id: ctx.schoolId }, select: { id: true, code: true, tenantId: true, maxUsers: true } });
    if (!school) throw new AppError('SCHOOL_NOT_FOUND', 'Okul bulunamadı', 404);

    const classroom = await prisma.classroom.findFirst({ where: { id: classroomId, schoolId: ctx.schoolId }, select: { id: true, branchId: true, adminUserId: true, level: { select: { adminUserId: true } } } });
    if (!classroom) throw new AppError('CLASSROOM_NOT_FOUND', 'Sınıf bulunamadı', 404);
    // Yetki: yönetici, sınıf öğretmeni (kendi sınıfı) veya seviyenin sorumlusu.
    if (!isManagerForBranch(ctx, classroom.branchId) && classroom.adminUserId !== ctx.userId && classroom.level?.adminUserId !== ctx.userId) {
      throw new AppError('FORBIDDEN_SCHOOL_ROLE', 'Bu sınıfa öğrenci ekleme yetkiniz yok', 403);
    }

    const rows = (input.students ?? [])
      .map((s) => ({ firstName: (s.firstName ?? '').trim(), lastName: (s.lastName ?? '').trim(), studentNo: (s.studentNo ?? '').trim() || null }))
      .filter((s) => s.firstName || s.lastName);
    if (rows.length === 0) throw new AppError('NO_STUDENTS', 'Geçerli öğrenci satırı yok (Ad/Soyad)', 400);
    if (rows.length > MAX_BULK_STUDENTS) throw new AppError('TOO_MANY', `Tek seferde en fazla ${MAX_BULK_STUDENTS} öğrenci`, 400);

    if (school.maxUsers > 0) {
      const activeCount = await prisma.schoolUser.count({ where: { schoolId: ctx.schoolId, isActive: true } });
      if (activeCount + rows.length > school.maxUsers) {
        throw new AppError('USER_QUOTA_EXCEEDED', `Kota yetersiz: kalan ${Math.max(0, school.maxUsers - activeCount)}, istenen ${rows.length}`, 409);
      }
    }

    const periodId = await currentPeriodId(ctx.schoolId); // öğrenciyi güncel döneme damgala
    // Şifre üretimi + hash transaction DIŞINDA (CPU yoğun; tx'i kısa tut)
    const withHash = await Promise.all(rows.map(async (r) => {
      const tempPassword = generateTempPassword();
      return { firstName: r.firstName, lastName: r.lastName, studentNo: r.studentNo, tempPassword, passwordHash: await bcrypt.hash(tempPassword, 12) };
    }));

    const created = await prisma.$transaction(async (tx) => {
      const out: Array<{ name: string; username: string; studentNo: string | null; tempPassword: string }> = [];
      for (const p of withHash) {
        const username = await nextSchoolUsername(tx, ctx.schoolId, school.code, 'STUDENT');
        const user = await tx.user.create({
          data: {
            email: `${username.toLowerCase()}@esinif.local`,
            username,
            firstName: p.firstName || null,
            lastName: p.lastName || null,
            passwordHash: p.passwordHash,
            role: 'CANDIDATE',
            status: 'ACTIVE',
            emailVerified: true,
            tenantId: school.tenantId,
            metadata: { schoolUser: true } as object,
          },
        });
        await tx.schoolUser.create({
          data: { userId: user.id, schoolId: ctx.schoolId, schoolRole: 'STUDENT' as any, username, studentNo: p.studentNo, branchId: classroom.branchId, classroomId: classroom.id, periodId },
        });
        out.push({ name: `${p.firstName} ${p.lastName}`.trim(), username, studentNo: p.studentNo, tempPassword: p.tempPassword });
      }
      return out;
    }, { timeout: 30000 });

    logger.info('school.students.bulk_created', { classroomId, count: created.length, actorId });
    schoolAudit(ctx, { action: 'SCHOOL_USERS_BULK_CREATED', entityType: 'Classroom', entityId: classroomId, metadata: { count: created.length } });
    return { count: created.length, created };
  }
}

/**
 * Verilen şube(ler)e (ve doğrudan verilen departman/sınıf id'lerine) ait TÜM kullanıcıları
 * kapsayan OR koşulu üretir. Aidiyet: SchoolUser.branchId (şube müdürü) ∪ şubenin
 * departmanlarına bağlı (öğretmen/zümre başkanı) ∪ şubenin sınıflarına bağlı (sınıf
 * öğretmeni/öğrenci). Departman şubeye doğrudan (branchId) veya seviye üzerinden
 * (level.branchId) bağlanabilir.
 */
async function membershipWhere(
  schoolId: string,
  opts: { branchIds?: string[]; departmentIds?: string[]; classroomIds?: string[] },
): Promise<Record<string, unknown>> {
  /* istanbul ignore next -- tüm çağıranlar branchIds geçer; ?? [] savunmacıdır */
  const branchIds = opts.branchIds ?? [];
  const deptIds = new Set<string>(opts.departmentIds ?? []);
  const classIds = new Set<string>(opts.classroomIds ?? []);
  const or: Record<string, unknown>[] = [];
  if (branchIds.length) {
    or.push({ branchId: { in: branchIds } });
    const [depts, classes] = await Promise.all([
      prisma.department.findMany({
        where: { schoolId, OR: [{ branchId: { in: branchIds } }, { level: { branchId: { in: branchIds } } }] },
        select: { id: true },
      }),
      prisma.classroom.findMany({ where: { schoolId, branchId: { in: branchIds } }, select: { id: true } }),
    ]);
    depts.forEach((d) => deptIds.add(d.id));
    classes.forEach((c) => classIds.add(c.id));
  }
  if (deptIds.size) or.push({ departmentId: { in: [...deptIds] } });
  if (classIds.size) or.push({ classroomId: { in: [...classIds] } });
  // Hiç koşul yoksa (örn. boş şube) kimseyi getirme.
  return or.length ? { OR: or } : { id: '__none__' };
}

export class ListSchoolUsersUseCase {
  async execute(input: { role?: string; q?: string; branchId?: string; periodId?: string; cursor?: string | null; limit?: number }, actorId?: string) {
    const ctx = await resolveSchoolContext(actorId);
    const take = Math.min(Math.max(input.limit ?? 30, 1), 100);
    const text = (input.q ?? '').trim();
    // Dönemsel arşiv yalnız ÖĞRENCİ sekmesinde: öğrenci listesi güncel döneme (veya seçilen
    // eski döneme) süzülür. Öğretmen/yönetici listesi dönemden ETKİLENMEZ.
    const studentPeriod = input.role === 'STUDENT' ? await resolvePeriodFilter(ctx.schoolId, input.periodId) : null;

    // Erişim kapsamı (designation) + şube süzmesini AND koşulları olarak biriktiririz.
    // ÖNEMLİ: bir kullanıcının şubeye aidiyeti SchoolUser.branchId ile SINIRLI DEĞİLDİR —
    // bu alan yalnız BRANCH_ADMIN'de doludur. Öğretmen/zümre başkanı departman, sınıf
    // öğretmeni/öğrenci sınıf üzerinden şubeye bağlıdır. Bu yüzden şube süzmesi aidiyet
    // (membershipWhere) üzerinden yapılır; aksi halde şube filtresi yalnız şube müdürünü getirir.
    const andClauses: Record<string, unknown>[] = [];
    if (ctx.schoolRole === 'BRANCH_ADMIN') {
      andClauses.push(await membershipWhere(ctx.schoolId, { branchIds: ctx.branchId ? [ctx.branchId] : [] }));
    } else if (ctx.schoolRole !== 'SCHOOL_ADMIN') {
      const scope = await resolveSchoolScope(actorId);
      if (scopeIsEmpty(scope) && !scope.departmentIds.length) throw new AppError('FORBIDDEN_SCHOOL_ROLE', 'Bu işlem için yetkiniz yok', 403);
      if (!scope.wholeSchool) {
        const set = new Set<string>(scope.fullBranchIds);
        if (scope.fullLevelIds.length) {
          const lv = await prisma.schoolLevel.findMany({ where: { id: { in: scope.fullLevelIds } }, select: { branchId: true } });
          lv.forEach((l) => l.branchId && set.add(l.branchId));
        }
        andClauses.push(await membershipWhere(ctx.schoolId, {
          branchIds: [...set],
          departmentIds: scope.departmentIds,
          classroomIds: scope.soloClassroomIds,
        }));
      }
    }
    // Okul yöneticisinin (ya da kapsam dahilinde herkesin) seçtiği şube filtresi — aidiyet bazlı.
    if (input.branchId) {
      andClauses.push(await membershipWhere(ctx.schoolId, { branchIds: [input.branchId] }));
    }

    const rows = await prisma.schoolUser.findMany({
      where: {
        schoolId: ctx.schoolId,
        // Rol verilmişse o role; verilmemişse öğrenci HARİÇ (yönetici/personel seçicileri öğrenci getirmez).
        ...(input.role && ASSIGNABLE.concat('SCHOOL_ADMIN' as any).includes(input.role as any)
          ? { schoolRole: input.role as any }
          : { schoolRole: { not: 'STUDENT' as any } }),
        ...(studentPeriod ? { periodId: studentPeriod } : {}),
        ...(text ? { username: { contains: text, mode: 'insensitive' as const } } : {}),
        ...(andClauses.length ? { AND: andClauses } : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
      include: {
        user: { select: { firstName: true, lastName: true } },
        branch: { select: { name: true } },
        classroom: { select: { name: true } },
        department: { select: { name: true } },
      },
    });
    const hasMore = rows.length > take;
    const items = (hasMore ? rows.slice(0, -1) : rows).map((su) => ({
      id: su.id,
      username: su.username,
      studentNo: su.studentNo ?? null,
      fullName: `${su.user.firstName ?? ''} ${su.user.lastName ?? ''}`.trim() || null,
      schoolRole: su.schoolRole,
      branchId: su.branchId ?? null,
      branchName: su.branch?.name ?? null,
      classroomId: su.classroomId ?? null,
      classroomName: su.classroom?.name ?? null,
      departmentName: su.department?.name ?? null,
      isActive: su.isActive,
      createdAt: su.createdAt,
    }));
    // hasMore ⟹ items non-empty (slice -1) → son eleman daima var
    return { items, nextCursor: hasMore ? items[items.length - 1]!.id : null };
  }
}

export class SetSchoolUserActiveUseCase {
  async execute(schoolUserId: string, input: { isActive: boolean }, actorId?: string) {
    const ctx = await resolveSchoolContext(actorId);
    requireSchoolRole(ctx, 'SCHOOL_ADMIN');
    const su = await prisma.schoolUser.findFirst({ where: { id: schoolUserId, schoolId: ctx.schoolId }, select: { id: true } });
    if (!su) throw new AppError('USER_NOT_FOUND', 'Kullanıcı bulunamadı', 404);
    const updated = await prisma.schoolUser.update({ where: { id: schoolUserId }, data: { isActive: !!input.isActive } });
    logger.info('school.user.active_changed', { schoolUserId, isActive: updated.isActive, actorId });
    schoolAudit(ctx, { action: 'SCHOOL_USER_ACTIVE_CHANGED', entityType: 'SchoolUser', entityId: schoolUserId, metadata: { isActive: updated.isActive } });
    return { id: updated.id, isActive: updated.isActive };
  }
}

/** Şifre sıfırlar — yeni geçici şifre üretir, TEK SEFER döner. */
export class ResetSchoolUserPasswordUseCase {
  async execute(schoolUserId: string, actorId?: string): Promise<{ username: string; tempPassword: string }> {
    const ctx = await resolveSchoolContext(actorId);
    requireSchoolRole(ctx, 'SCHOOL_ADMIN');
    const su = await prisma.schoolUser.findFirst({
      where: { id: schoolUserId, schoolId: ctx.schoolId },
      select: { id: true, userId: true, username: true },
    });
    if (!su) throw new AppError('USER_NOT_FOUND', 'Kullanıcı bulunamadı', 404);

    const tempPassword = generateTempPassword();
    const passwordHash = await bcrypt.hash(tempPassword, 12);
    await prisma.user.update({ where: { id: su.userId }, data: { passwordHash, activeSessionId: null } });
    logger.info('school.user.password_reset', { schoolUserId, actorId });
    schoolAudit(ctx, { action: 'SCHOOL_USER_PASSWORD_RESET', entityType: 'SchoolUser', entityId: schoolUserId, metadata: { username: su.username } });
    return { username: su.username, tempPassword };
  }
}
