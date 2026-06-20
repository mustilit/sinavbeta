import { Injectable, Logger } from '@nestjs/common';
import { prisma } from '../../../infrastructure/database/prisma';
import { PrismaAuditLogRepository } from '../../../infrastructure/repositories/PrismaAuditLogRepository';

/** Türkçe karakter + sembolleri URL-güvenli ASCII slug'a çevirir. */
function slugify(input: string) {
  const map: Record<string, string> = {
    ç: 'c', Ç: 'c', ğ: 'g', Ğ: 'g', ı: 'i', İ: 'i', ö: 'o', Ö: 'o', ş: 's', Ş: 's', ü: 'u', Ü: 'u', ' ': '-',
  };
  return input
    .trim()
    .toLowerCase()
    .split('')
    .map((c) => map[c] ?? c)
    .join('')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

type Meta = Record<string, unknown> | null | undefined;

function err(code: string, status: number) {
  const e: any = new Error(code);
  e.status = status;
  e.code = code;
  return e;
}

/**
 * Sınıf (GradeLevel) CRUD — ExamType deseni. Self-contained (prisma direct).
 * Logo metadata.icon'da (havuzdan lucide ikon). Audit best-effort (warn).
 */
@Injectable()
export class ListGradeLevelsUseCase {
  async execute(activeOnly = true) {
    return prisma.gradeLevel.findMany({
      where: activeOnly ? { active: true } : undefined,
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
    });
  }
}

@Injectable()
export class CreateGradeLevelUseCase {
  private readonly logger = new Logger(CreateGradeLevelUseCase.name);
  constructor(private readonly auditRepo?: PrismaAuditLogRepository) {}

  async execute(
    input: { name: string; slug?: string; description?: string | null; metadata?: Meta; active?: boolean },
    actorId?: string | null,
  ) {
    const slug = input.slug && input.slug.trim().length ? slugify(input.slug) : slugify(input.name);
    if (!slug) throw err('GRADELEVEL_NAME_INVALID', 400);
    const exists = await prisma.gradeLevel.findUnique({ where: { slug } });
    if (exists) throw err('GRADELEVEL_SLUG_EXISTS', 409);
    const created = await prisma.gradeLevel.create({
      data: {
        name: input.name.trim(),
        slug,
        description: input.description?.trim() || null,
        metadata: (input.metadata as object) ?? {},
        active: input.active ?? true,
      },
    });
    try {
      await this.auditRepo?.create({ action: 'GRADELEVEL_CREATED', entityType: 'GRADE_LEVEL', entityId: created.id, actorId: actorId ?? null, metadata: {} });
    } catch (e: any) {
      this.logger.warn(`gradelevel.create.audit_failed ${e?.message} entityId=${created.id} actorId=${actorId ?? null}`);
    }
    return created;
  }
}

@Injectable()
export class UpdateGradeLevelUseCase {
  private readonly logger = new Logger(UpdateGradeLevelUseCase.name);
  constructor(private readonly auditRepo?: PrismaAuditLogRepository) {}

  async execute(
    id: string,
    input: { name?: string; slug?: string; description?: string | null; metadata?: Meta; active?: boolean },
    actorId?: string | null,
  ) {
    const before = await prisma.gradeLevel.findUnique({ where: { id } });
    if (!before) throw err('GRADELEVEL_NOT_FOUND', 404);
    const data: any = {};
    if (input.name !== undefined) data.name = input.name.trim();
    if (input.slug !== undefined) {
      const slug = slugify(input.slug);
      if (slug !== before.slug) {
        const clash = await prisma.gradeLevel.findUnique({ where: { slug } });
        if (clash) throw err('GRADELEVEL_SLUG_EXISTS', 409);
        data.slug = slug;
      }
    }
    if (input.description !== undefined) data.description = input.description?.trim() || null;
    if (input.active !== undefined) data.active = input.active;
    if (input.metadata !== undefined) data.metadata = { ...((before.metadata as object) ?? {}), ...((input.metadata as object) ?? {}) };
    const updated = await prisma.gradeLevel.update({ where: { id }, data });
    try {
      await this.auditRepo?.create({ action: 'GRADELEVEL_UPDATED', entityType: 'GRADE_LEVEL', entityId: id, actorId: actorId ?? null, metadata: { changedFields: Object.keys(data) } });
    } catch (e: any) {
      this.logger.warn(`gradelevel.update.audit_failed ${e?.message} entityId=${id} actorId=${actorId ?? null}`);
    }
    return updated;
  }
}

@Injectable()
export class DeleteGradeLevelUseCase {
  private readonly logger = new Logger(DeleteGradeLevelUseCase.name);
  constructor(private readonly auditRepo?: PrismaAuditLogRepository) {}

  async execute(id: string, actorId?: string | null) {
    const existing = await prisma.gradeLevel.findUnique({ where: { id } });
    if (!existing) throw err('GRADELEVEL_NOT_FOUND', 404);
    if (existing.slug === 'genel') throw err('GRADELEVEL_DEFAULT_PROTECTED', 409);
    // FK SetNull: bağlı test/tünel/yazılı içerik gradeLevelId'si null olur (Genel'e düşer UI'da).
    await prisma.gradeLevel.delete({ where: { id } });
    try {
      await this.auditRepo?.create({ action: 'GRADELEVEL_DELETED', entityType: 'GRADE_LEVEL', entityId: id, actorId: actorId ?? null, metadata: { name: existing.name } });
    } catch (e: any) {
      this.logger.warn(`gradelevel.delete.audit_failed ${e?.message} entityId=${id} actorId=${actorId ?? null}`);
    }
    return { id };
  }
}
