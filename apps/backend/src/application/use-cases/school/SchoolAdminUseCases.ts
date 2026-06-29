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
import { generateTempPassword, schoolAudit } from './schoolHelpers';

const CODE_RE = /^[A-Z0-9]{3,5}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
        // Kuruluş dönemini çoklu-dönem yetkilendirmesine de ekle
        periodLinks: { create: { periodId: input.periodId } },
        maxUsers: Math.max(0, Math.floor(input.maxUsers ?? 0)),
        annualLiveLimit: Math.max(0, Math.floor(input.annualLiveLimit ?? 0)),
        tenantId: getDefaultTenantId(),
      },
    });
    logger.info('school.created', { id: created.id, code, actorId });
    schoolAudit(actorId ?? undefined, { action: 'SCHOOL_CREATED', entityType: 'School', entityId: created.id, metadata: { code, name: created.name } });
    return created;
  }
}

export class ListSchoolsUseCase {
  async execute(
    params: {
      q?: string;
      schoolType?: string;
      adminEmail?: string;
      periodId?: string;
      page?: number;
      pageSize?: number;
    } = {},
  ) {
    const page = Math.max(1, Math.floor(params.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Math.floor(params.pageSize ?? 12)));
    const q = (params.q ?? '').trim();
    const adminEmail = (params.adminEmail ?? '').trim();

    const where: Record<string, unknown> = { deletedAt: null };
    if (q) {
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { code: { contains: q, mode: 'insensitive' } },
        { city: { contains: q, mode: 'insensitive' } },
      ];
    }
    if (params.schoolType) where.schoolType = params.schoolType as any;
    if (params.periodId) where.periodId = params.periodId;
    if (adminEmail) where.adminUser = { email: { contains: adminEmail, mode: 'insensitive' } };

    const [total, rows] = await Promise.all([
      prisma.school.count({ where: where as any }),
      prisma.school.findMany({
        where: where as any,
        orderBy: [{ createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          period: { select: { id: true, name: true } },
          periodLinks: { select: { period: { select: { id: true, name: true, startDate: true } } } },
          adminUser: { select: { id: true, username: true, email: true, firstName: true, lastName: true } },
          _count: { select: { schoolUsers: true, branches: true, departments: true } },
        },
      }),
    ]);

    const items = rows.map((s) => ({
      id: s.id,
      name: s.name,
      code: s.code,
      city: s.city,
      schoolType: s.schoolType,
      period: s.period,
      adminUsername: s.adminUser?.username ?? null,
      adminEmail: s.adminUser?.email ?? null,
      adminName: [s.adminUser?.firstName, s.adminUser?.lastName].filter(Boolean).join(' ') || null,
      // Çoklu dönem yetkilendirmesi (kuruluş dönemi backfill ile dahil)
      periods: s.periodLinks
        .map((pl) => pl.period)
        // startDate şemada zorunlu (non-null) → ?./?? gereksiz savunma
        .sort((a, b) => b.startDate.getTime() - a.startDate.getTime())
        .map((p) => ({ id: p.id, name: p.name })),
      maxUsers: s.maxUsers,
      userCount: s._count.schoolUsers,
      branchCount: s._count.branches,
      departmentCount: s._count.departments,
      annualLiveLimit: s.annualLiveLimit,
      usedLiveCount: s.usedLiveCount,
      isActive: s.isActive,
      createdAt: s.createdAt,
    }));

    return { items, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
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

// ── Okul ↔ Dönem yetkilendirmesi (çoklu) ──────────────────────────────────────
export class AssignSchoolPeriodUseCase {
  async execute(schoolId: string, input: { periodId: string }, actorId?: string | null) {
    const school = await prisma.school.findUnique({ where: { id: schoolId }, select: { id: true } });
    if (!school) throw new AppError('SCHOOL_NOT_FOUND', 'Okul bulunamadı', 404);
    const period = await prisma.academicPeriod.findUnique({ where: { id: input.periodId }, select: { id: true } });
    if (!period) throw new AppError('PERIOD_NOT_FOUND', 'Dönem bulunamadı', 404);
    const clash = await prisma.schoolPeriod.findUnique({ where: { schoolId_periodId: { schoolId, periodId: input.periodId } }, select: { id: true } });
    // Dönem ata = o dönemi okulun GÜNCEL (aktif) dönemi yap + yetkilendirme linki.
    // Böylece dönemsel sayfalar (ödev/rapor/canlı/öğrenci) yeni döneme sıfırlanır;
    // eski veriler dönem filtresiyle çağrılabilir kalır.
    if (!clash) await prisma.schoolPeriod.create({ data: { schoolId, periodId: input.periodId } });
    await prisma.school.update({ where: { id: schoolId }, data: { periodId: input.periodId } });
    logger.info('school.period.activated', { schoolId, periodId: input.periodId, actorId });
    return { ok: true };
  }
}

export class RemoveSchoolPeriodUseCase {
  async execute(schoolId: string, periodId: string, actorId?: string | null) {
    const link = await prisma.schoolPeriod.findUnique({ where: { schoolId_periodId: { schoolId, periodId } }, select: { id: true } });
    if (!link) throw new AppError('PERIOD_LINK_NOT_FOUND', 'Dönem yetkilendirmesi bulunamadı', 404);
    const remaining = await prisma.schoolPeriod.count({ where: { schoolId } });
    if (remaining <= 1) throw new AppError('LAST_PERIOD', 'Okulun en az bir dönemi olmalı', 409);
    await prisma.schoolPeriod.delete({ where: { id: link.id } });
    logger.info('school.period.unlinked', { schoolId, periodId, actorId });
    return { ok: true };
  }
}

/**
 * Okul Yöneticisi atama — yöneticinin GERÇEK e-posta adresiyle yeni bir
 * User + SchoolUser(SCHOOL_ADMIN) oluşturur. Sistem otomatik kullanıcı adı ÜRETMEZ;
 * yönetici e-postasıyla giriş yapar. Yalnızca geçici şifre üretilir.
 * `username` (şema zorunlu/unique) e-posta değerine ayarlanır — ayrı bir tanımlayıcı yok.
 * Var olan yöneticiyi değiştirmek için eski bağlantı bırakılır (yeni admin atanır).
 */
export class AssignSchoolAdminUseCase {
  async execute(
    schoolId: string,
    input: { email: string; firstName?: string; lastName?: string },
    actorId?: string | null,
  ): Promise<{ email: string; tempPassword: string }> {
    const school = await prisma.school.findUnique({ where: { id: schoolId }, select: { id: true, code: true, tenantId: true } });
    if (!school) throw new AppError('SCHOOL_NOT_FOUND', 'Okul bulunamadı', 404);

    const email = (input.email ?? '').trim().toLowerCase();
    if (!EMAIL_RE.test(email)) throw new AppError('INVALID_EMAIL', 'Geçerli bir e-posta adresi girin', 400);

    // E-posta sistemde kayıtlıysa hesap çakışması olur — mevcut bir hesabı sessizce
    // okul yöneticisine dönüştürmeyiz.
    const clash = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (clash) throw new AppError('EMAIL_TAKEN', 'Bu e-posta zaten kayıtlı', 409);

    const tempPassword = generateTempPassword();
    const passwordHash = await bcrypt.hash(tempPassword, 12);

    await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email,
          username: email, // okul yöneticisi e-posta ile giriş yapar; ayrı kullanıcı adı üretilmez
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
        data: { userId: user.id, schoolId, schoolRole: 'SCHOOL_ADMIN' as any, username: email },
      });

      await tx.school.update({ where: { id: schoolId }, data: { adminUserId: user.id } });
    });

    logger.info('school.admin_assigned', { schoolId, email, actorId });
    return { email, tempPassword };
  }
}
