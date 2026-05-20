// @ts-nocheck
import { Injectable } from '@nestjs/common';
import { prisma } from '../../../infrastructure/database/prisma';
import { slugify } from '../../utils/slugify';

/**
 * Mevcut konuyu günceller. examTypeIds gönderilirse tüm bağlantılar sıfırlanıp yeniden oluşturulur.
 */
@Injectable()
export class UpdateTopicUseCase {
  async execute(
    id: string,
    input: { name?: string; examTypeIds?: string[]; parentId?: string | null; active?: boolean; slug?: string },
    actorId?: string,
  ) {
    const existing = await prisma.topic.findUnique({ where: { id } });
    if (!existing) { const e: any = new Error('Konu bulunamadı'); e.status = 404; throw e; }

    const data: any = {};
    if (input.name !== undefined) { data.name = input.name.trim(); data.slug = slugify(input.name); }
    if (input.slug !== undefined) data.slug = input.slug;
    if (input.active !== undefined) data.active = input.active;
    if ('parentId' in input) data.parentId = input.parentId ?? null;

    if (input.examTypeIds !== undefined) {
      await (prisma as any).topicExamType.deleteMany({ where: { topicId: id } });
      if (input.examTypeIds.length > 0) {
        await (prisma as any).topicExamType.createMany({
          data: input.examTypeIds.map((eid) => ({ topicId: id, examTypeId: eid })),
          skipDuplicates: true,
        });
      }
    }

    const updated = await (prisma.topic as any).update({
      where: { id },
      data,
      include: {
        examTypes: { include: { examType: { select: { id: true, name: true } } } },
        parent: { select: { id: true, name: true } },
        children: { select: { id: true, name: true } },
      },
    });

    try {
      await (prisma as any).auditLog.create({
        data: { action: 'TOPIC_UPDATED', entityType: 'TOPIC', entityId: id, actorId: actorId ?? null, metadata: {} },
      });
    } catch { /* swallow */ }

    return {
      id: updated.id, name: updated.name, slug: updated.slug, active: updated.active,
      parentId: (updated as any).parentId ?? null, parentName: (updated as any).parent?.name ?? null,
      examTypes: (updated as any).examTypes.map((te: any) => ({ id: te.examType.id, name: te.examType.name })),
      children: (updated as any).children.map((c: any) => ({ id: c.id, name: c.name })),
    };
  }
}
