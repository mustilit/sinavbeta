/**
 * E-Sınıf — Okul Yöneticisi kullanıcı yönetimi (Sprint 1):
 * Kullanıcı ekleme (otomatik username + geçici şifre + kota), listeleme,
 * pasifleştirme, şifre sıfırlama. Tümü okul bağlamına kilitli.
 */
import * as bcrypt from 'bcryptjs';
import { prisma } from '../../../infrastructure/database/prisma';
import { AppError } from '../../errors/AppError';
import { logger } from '../../../infrastructure/logger/logger';
import { resolveSchoolContext, requireSchoolRole, nextSchoolUsername, generateTempPassword, type SchoolRoleStr } from './schoolHelpers';

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
          branchId: role === 'STUDENT' || role === 'BRANCH_ADMIN' ? input.branchId ?? null : null,
          classroomId: role === 'STUDENT' ? input.classroomId ?? null : null,
          departmentId: role === 'TEACHER' || role === 'DEPT_HEAD' ? input.departmentId ?? null : null,
        },
      });
      return { schoolUserId: su.id, username };
    });

    logger.info('school.user.created', { schoolUserId: result.schoolUserId, role, schoolId: ctx.schoolId, actorId });
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
    input: { students: Array<{ firstName?: string; lastName?: string }> },
    actorId?: string,
  ): Promise<{ count: number; created: Array<{ name: string; username: string; tempPassword: string }> }> {
    const ctx = await resolveSchoolContext(actorId);
    requireSchoolRole(ctx, 'SCHOOL_ADMIN', 'BRANCH_ADMIN');

    const school = await prisma.school.findUnique({ where: { id: ctx.schoolId }, select: { id: true, code: true, tenantId: true, maxUsers: true } });
    if (!school) throw new AppError('SCHOOL_NOT_FOUND', 'Okul bulunamadı', 404);

    const classroom = await prisma.classroom.findFirst({ where: { id: classroomId, schoolId: ctx.schoolId }, select: { id: true, branchId: true } });
    if (!classroom) throw new AppError('CLASSROOM_NOT_FOUND', 'Sınıf bulunamadı', 404);
    if (ctx.schoolRole === 'BRANCH_ADMIN' && ctx.branchId !== classroom.branchId) {
      throw new AppError('FORBIDDEN_SCHOOL_ROLE', 'Yalnız kendi şubenize öğrenci ekleyebilirsiniz', 403);
    }

    const rows = (input.students ?? [])
      .map((s) => ({ firstName: (s.firstName ?? '').trim(), lastName: (s.lastName ?? '').trim() }))
      .filter((s) => s.firstName || s.lastName);
    if (rows.length === 0) throw new AppError('NO_STUDENTS', 'Geçerli öğrenci satırı yok (Ad/Soyad)', 400);
    if (rows.length > MAX_BULK_STUDENTS) throw new AppError('TOO_MANY', `Tek seferde en fazla ${MAX_BULK_STUDENTS} öğrenci`, 400);

    if (school.maxUsers > 0) {
      const activeCount = await prisma.schoolUser.count({ where: { schoolId: ctx.schoolId, isActive: true } });
      if (activeCount + rows.length > school.maxUsers) {
        throw new AppError('USER_QUOTA_EXCEEDED', `Kota yetersiz: kalan ${Math.max(0, school.maxUsers - activeCount)}, istenen ${rows.length}`, 409);
      }
    }

    // Şifre üretimi + hash transaction DIŞINDA (CPU yoğun; tx'i kısa tut)
    const withHash = await Promise.all(rows.map(async (r) => {
      const tempPassword = generateTempPassword();
      return { firstName: r.firstName, lastName: r.lastName, tempPassword, passwordHash: await bcrypt.hash(tempPassword, 12) };
    }));

    const created = await prisma.$transaction(async (tx) => {
      const out: Array<{ name: string; username: string; tempPassword: string }> = [];
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
          data: { userId: user.id, schoolId: ctx.schoolId, schoolRole: 'STUDENT' as any, username, branchId: classroom.branchId, classroomId: classroom.id },
        });
        out.push({ name: `${p.firstName} ${p.lastName}`.trim(), username, tempPassword: p.tempPassword });
      }
      return out;
    }, { timeout: 30000 });

    logger.info('school.students.bulk_created', { classroomId, count: created.length, actorId });
    return { count: created.length, created };
  }
}

export class ListSchoolUsersUseCase {
  async execute(input: { role?: string; q?: string; cursor?: string | null; limit?: number }, actorId?: string) {
    const ctx = await resolveSchoolContext(actorId);
    requireSchoolRole(ctx, 'SCHOOL_ADMIN', 'BRANCH_ADMIN');
    const take = Math.min(Math.max(input.limit ?? 30, 1), 100);
    const text = (input.q ?? '').trim();

    const rows = await prisma.schoolUser.findMany({
      where: {
        schoolId: ctx.schoolId,
        ...(input.role && ASSIGNABLE.concat('SCHOOL_ADMIN' as any).includes(input.role as any) ? { schoolRole: input.role as any } : {}),
        ...(ctx.schoolRole === 'BRANCH_ADMIN' ? { branchId: ctx.branchId ?? '__none__' } : {}),
        ...(text ? { username: { contains: text, mode: 'insensitive' as const } } : {}),
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
      fullName: `${su.user.firstName ?? ''} ${su.user.lastName ?? ''}`.trim() || null,
      schoolRole: su.schoolRole,
      branchName: su.branch?.name ?? null,
      classroomName: su.classroom?.name ?? null,
      departmentName: su.department?.name ?? null,
      isActive: su.isActive,
      createdAt: su.createdAt,
    }));
    return { items, nextCursor: hasMore ? items[items.length - 1]?.id ?? null : null };
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
    return { username: su.username, tempPassword };
  }
}
