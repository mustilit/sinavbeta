// @ts-nocheck
import { prisma } from '../database/prisma';
import { IFollowRepository } from '../../domain/interfaces/IFollowRepository';

export class PrismaFollowRepository implements IFollowRepository {
  async listFollowersForEducator(educatorId: string): Promise<string[]> {
    const rows = await prisma.follow.findMany({ where: { educatorId, notificationsEnabled: true }, select: { followerId: true } });
    return rows.map((r) => r.followerId);
  }

  async listFollowersForExamType(examTypeId: string): Promise<string[]> {
    const rows = await prisma.follow.findMany({ where: { examTypeId, notificationsEnabled: true }, select: { followerId: true } });
    return rows.map((r) => r.followerId);
  }

  async listFollowedEducatorIds(followerId: string): Promise<string[]> {
    const rows = await prisma.follow.findMany({ where: { followerId, followType: 'EDUCATOR', educatorId: { not: null } }, select: { educatorId: true } });
    return rows.map((r) => r.educatorId!).filter(Boolean);
  }

  async listFollowedExamTypeIds(followerId: string): Promise<string[]> {
    const rows = await prisma.follow.findMany({ where: { followerId, followType: 'EXAM_TYPE', examTypeId: { not: null } }, select: { examTypeId: true } });
    return rows.map((r) => r.examTypeId!).filter(Boolean);
  }

  async upsertFollow(input: { followerId: string; followType: 'EDUCATOR' | 'EXAM_TYPE'; educatorId?: string | null; examTypeId?: string | null; notificationsEnabled?: boolean }): Promise<void> {
    // determine unique key
    if (input.followType === 'EDUCATOR' && input.educatorId) {
      await prisma.follow.upsert({
        where: { followerId_educatorId: { followerId: input.followerId, educatorId: input.educatorId } as any } as any,
        create: { followerId: input.followerId, followType: input.followType, educatorId: input.educatorId, notificationsEnabled: input.notificationsEnabled ?? true },
        update: { notificationsEnabled: input.notificationsEnabled ?? true },
      } as any);
      return;
    }
    if (input.followType === 'EXAM_TYPE' && input.examTypeId) {
      await prisma.follow.upsert({
        where: { followerId_examTypeId: { followerId: input.followerId, examTypeId: input.examTypeId } as any } as any,
        create: { followerId: input.followerId, followType: input.followType, examTypeId: input.examTypeId, notificationsEnabled: input.notificationsEnabled ?? true },
        update: { notificationsEnabled: input.notificationsEnabled ?? true },
      } as any);
      return;
    }
    throw new Error('Invalid upsertFollow input');
  }

  async deleteFollow(input: { followerId: string; followType: 'EDUCATOR' | 'EXAM_TYPE'; educatorId?: string | null; examTypeId?: string | null }): Promise<void> {
    if (input.followType === 'EDUCATOR' && input.educatorId) {
      await prisma.follow.deleteMany({ where: { followerId: input.followerId, followType: 'EDUCATOR', educatorId: input.educatorId } });
      return;
    }
    if (input.followType === 'EXAM_TYPE' && input.examTypeId) {
      await prisma.follow.deleteMany({ where: { followerId: input.followerId, followType: 'EXAM_TYPE', examTypeId: input.examTypeId } });
      return;
    }
  }

  async listFollowsByFollower(followerId: string, followType?: 'EDUCATOR' | 'EXAM_TYPE') {
    const where: any = { followerId };
    if (followType) where.followType = followType;
    return prisma.follow.findMany({ where });
  }

  async listFollowerIdsByEducator(educatorId: string): Promise<string[]> {
    const rows = await prisma.follow.findMany({ where: { educatorId }, select: { followerId: true } });
    return rows.map((r) => r.followerId);
  }

  async listFollowerIdsByExamType(examTypeId: string): Promise<string[]> {
    const rows = await prisma.follow.findMany({ where: { examTypeId }, select: { followerId: true } });
    return rows.map((r) => r.followerId);
  }
}

