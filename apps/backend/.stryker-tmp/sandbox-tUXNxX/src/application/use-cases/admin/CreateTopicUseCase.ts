// @ts-nocheck
import { Injectable } from '@nestjs/common';
import { prisma } from '../../../infrastructure/database/prisma';
import { slugify } from '../../utils/slugify';

/**
 * Yeni konu oluşturur. examTypeIds dizisi ile birden fazla sınav türüne bağlanabilir.
 * parentId ile üst konuya bağlanarak ağaç yapısı oluşturulur.
 */
@Injectable()
export class CreateTopicUseCase {
  async execute(
    input: { name: string; examTypeIds?: string[]; parentId?: string; active?: boolean },
    actorId?: string,
  ) {
    if (!input.name?.trim()) {
      const e: any = new Error('Konu adı zorunludur'); e.status = 400; throw e;
    }
    const slug = slugify(input.name);

    if (input.parentId) {
      const parent = await prisma.topic.findUnique({ where: { id: input.parentId } });
      if (!parent) { const e: any = new Error('Üst konu bulunamadı'); e.status = 404; throw e; }
    }

    const created = await (prisma.topic as any).create({
      data: {
        name: input.name.trim(),
        slug,
        active: input.active ?? true,
        parentId: input.parentId ?? null,
        examTypes: input.examTypeIds?.length
          ? { create: input.examTypeIds.map((eid) => ({ examTypeId: eid })) }
          : undefined,
      },
      include: {
        examTypes: { include: { examType: { select: { id: true, name: true } } } },
        parent: { select: { id: true, name: true } },
        children: true,
      },
    });

    try {
      await (prisma as any).auditLog.create({
        data: { action: 'TOPIC_CREATED', entityType: 'TOPIC', entityId: created.id, actorId: actorId ?? null, metadata: {} },
      });
    } catch { /* swallow */ }

    return this.mapTopic(created);
  }

  private mapTopic(t: any) {
    return {
      id: t.id, name: t.name, slug: t.slug, active: t.active,
      parentId: t.parentId ?? null, parentName: t.parent?.name ?? null,
      examTypes: t.examTypes.map((te: any) => ({ id: te.examType.id, name: te.examType.name })),
      children: [],
    };
  }
}
