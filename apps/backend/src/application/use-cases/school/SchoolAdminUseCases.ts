/**
 * E-Sınıf — Platform Admin use-case'leri (Sprint 1 Foundation):
 * Akademik dönem + okul CRUD + okul yöneticisi atama.
 * Tümü ADMIN rolüyle çağrılır (controller @Roles('ADMIN')).
 */
import * as bcrypt from 'bcryptjs';
import { prisma } from '../../../infrastructure/database/prisma';
import { AppError } from '../../errors/AppError';
import { getDefaultTenantId } from '../../../common/tenant';
import { logger } from '../../../infrastructure/logger/logger';
import { formatSchoolUsername, generateTempPassword } from './schoolHelpers';

const CODE_RE = /^[A-Z0-9]{3,5}$/;

// ── Akademik Dönem ──────────────────────────────────────────────────────────
export class CreateAcademicPeriodUseCase {
  async execute(input: { name: string; startDate: string; endDate: string; isActive?: boolean }, actorId?: string | null) {
    const name = (input.name ?? '').trim();
    if (!name) throw new AppError('NAME_REQUIRED', 'Dönem adı zorunlu', 400);
    const start = new Date(input.startDate);
    const end = new Date(input.endDate);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) throw new AppError('INVALID_DATE', 'Geçersiz tarih', 400);
    if (end <= start) throw new AppError('INVALID_RANGE', 'Bitiş tarihi başlangıçtan sonra olmalı', 400);

    const created = await prisma.academicPeriod.create({
      data: { name, startDate: start, endDate: end, isActive: input.isActive ?? false, tenantId: getDefaultTenantId() },
    });
    logger.info('school.period.created', { id: created.id, actorId });
    return created;
  }
}

export class ListAcademicPeriodsUseCase {
  async execute() {
    return prisma.academicPeriod.findMany({ orderBy: [{ startDate: 'desc' }] });
  }
}

// ── Okul ────────────────────────────────────────────────────────────────────
export class CreateSchoolUseCase {
  async execute(
    input: { name: string; code: string; city?: string; schoolType?: string; periodId: string; maxUsers?: number; annualLiveLimit?: number },
    actorId?: string | null,
  ) {
    const name = (input.name ?? '').trim();
    if (!name) throw new AppError('NAME_REQUIRED', 'Okul adı zorunlu', 400);
    const code = (input.code ?? '').trim().toUpperCase();
    if (!CODE_RE.test(code)) throw new AppError('INVALID_CODE', 'Okul kodu 3-5 harf/rakam olmalı', 400);

    const period = await prisma.academicPeriod.findUnique({ where: { id: input.periodId }, select: { id: true } });
    if (!period) throw new AppError('PERIOD_NOT_FOUND', 'Dönem bulunamadı', 404);

    const clash = await prisma.school.findUnique({ where: { code }, select: { id: true } });
    if (clash) throw new AppError('CODE_TAKEN', 'Bu okul kodu kullanımda', 409);

    const created = await prisma.school.create({
      data: {
        name,
        code,
        city: (input.city ?? '').trim() || null,
        schoolType: (input.schoolType as any) ?? 'MIDDLE',
        periodId: input.periodId,
        maxUsers: Math.max(0, Math.floor(input.maxUsers ?? 0)),
        annualLiveLimit: Math.max(0, Math.floor(input.annualLiveLimit ?? 0)),
        tenantId: getDefaultTenantId(),
      },
    });
    logger.info('school.created', { id: created.id, code, actorId });
    return created;
  }
}

export class ListSchoolsUseCase {
  async execute() {
    const rows = await prisma.school.findMany({
      where: { deletedAt: null },
      orderBy: [{ createdAt: 'desc' }],
      include: {
        period: { select: { id: true, name: true } },
        adminUser: { select: { id: true, username: true } },
        _count: { select: { schoolUsers: true, branches: true, departments: true } },
      },
    });
    return rows.map((s) => ({
      id: s.id,
      name: s.name,
      code: s.code,
      city: s.city,
      schoolType: s.schoolType,
      period: s.period,
      adminUsername: s.adminUser?.username ?? null,
      maxUsers: s.maxUsers,
      userCount: s._count.schoolUsers,
      branchCount: s._count.branches,
      departmentCount: s._count.departments,
      annualLiveLimit: s.annualLiveLimit,
      usedLiveCount: s.usedLiveCount,
      isActive: s.isActive,
      createdAt: s.createdAt,
    }));
  }
}

export class UpdateSchoolUseCase {
  async execute(
    id: string,
    input: { name?: string; city?: string; schoolType?: string; maxUsers?: number; annualLiveLimit?: number; isActive?: boolean },
    actorId?: string | null,
  ) {
    const school = await prisma.school.findUnique({ where: { id }, select: { id: true } });
    if (!school) throw new AppError('SCHOOL_NOT_FOUND', 'Okul bulunamadı', 404);

    const data: Record<string, unknown> = {};
    if (input.name !== undefined) {
      const n = input.name.trim();
      if (!n) throw new AppError('NAME_REQUIRED', 'Okul adı zorunlu', 400);
      data.name = n;
    }
    if (input.city !== undefined) data.city = input.city.trim() || null;
    if (input.schoolType !== undefined) data.schoolType = input.schoolType as any;
    if (input.maxUsers !== undefined) data.maxUsers = Math.max(0, Math.floor(input.maxUsers));
    if (input.annualLiveLimit !== undefined) data.annualLiveLimit = Math.max(0, Math.floor(input.annualLiveLimit));
    if (input.isActive !== undefined) data.isActive = !!input.isActive;

    const updated = await prisma.school.update({ where: { id }, data });
    logger.info('school.updated', { id, actorId, changedFields: Object.keys(data) });
    return updated;
  }
}

export class DeactivateSchoolUseCase {
  async execute(id: string, actorId?: string | null) {
    const school = await prisma.school.findUnique({ where: { id }, select: { id: true } });
    if (!school) throw new AppError('SCHOOL_NOT_FOUND', 'Okul bulunamadı', 404);
    const updated = await prisma.school.update({ where: { id }, data: { isActive: false, deletedAt: new Date() } });
    logger.info('school.deactivated', { id, actorId });
    return { id: updated.id, isActive: updated.isActive };
  }
}

/**
 * Okul Yöneticisi atama — yeni bir User + SchoolUser(SCHOOL_ADMIN) oluşturur,
 * otomatik username (KOD-A-0001) + geçici şifre üretir, School.adminUserId'yi bağlar.
 * Var olan yöneticiyi değiştirmek için eski bağlantı bırakılır (yeni admin atanır).
 */
export class AssignSchoolAdminUseCase {
  async execute(
    schoolId: string,
    input: { firstName?: string; lastName?: string },
    actorId?: string | null,
  ): Promise<{ username: string; tempPassword: string }> {
    const school = await prisma.school.findUnique({ where: { id: schoolId }, select: { id: true, code: true, tenantId: true } });
    if (!school) throw new AppError('SCHOOL_NOT_FOUND', 'Okul bulunamadı', 404);

    const tempPassword = generateTempPassword();
    const passwordHash = await bcrypt.hash(tempPassword, 12);

    const result = await prisma.$transaction(async (tx) => {
      const seq = (await tx.schoolUser.count({ where: { schoolId, schoolRole: 'SCHOOL_ADMIN' as any } })) + 1;
      const username = formatSchoolUsername(school.code, 'SCHOOL_ADMIN', seq);

      const user = await tx.user.create({
        data: {
          email: `${username.toLowerCase()}@esinif.local`,
          username,
          firstName: (input.firstName ?? '').trim() || null,
          lastName: (input.lastName ?? '').trim() || null,
          passwordHash,
          role: 'CANDIDATE', // marketplace rolü kullanılmaz; yetki SchoolUser.schoolRole'de
          status: 'ACTIVE',
          emailVerified: true,
          tenantId: school.tenantId,
          metadata: { schoolUser: true } as object,
        },
      });

      await tx.schoolUser.create({
        data: { userId: user.id, schoolId, schoolRole: 'SCHOOL_ADMIN' as any, username },
      });

      await tx.school.update({ where: { id: schoolId }, data: { adminUserId: user.id } });
      return { username };
    });

    logger.info('school.admin_assigned', { schoolId, username: result.username, actorId });
    return { username: result.username, tempPassword };
  }
}
