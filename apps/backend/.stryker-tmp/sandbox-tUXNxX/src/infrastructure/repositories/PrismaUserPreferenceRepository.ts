// @ts-nocheck
import { prisma } from '../database/prisma';
import type { IUserPreferenceRepository, UserPreferenceRecord } from '../../domain/interfaces/IUserPreferenceRepository';

export class PrismaUserPreferenceRepository implements IUserPreferenceRepository {
  async findByUserId(userId: string): Promise<UserPreferenceRecord | null> {
    const row = await prisma.userPreference.findUnique({ where: { userId } });
    if (!row) return null;
    return {
      id: row.id,
      userId: row.userId,
      preferences: (row.preferences as Record<string, unknown>) ?? {},
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  async upsert(userId: string, preferences: Record<string, unknown>): Promise<UserPreferenceRecord> {
    const row = await prisma.userPreference.upsert({
      where: { userId },
      create: { userId, preferences: preferences as object },
      update: { preferences: preferences as object },
    });
    return {
      id: row.id,
      userId: row.userId,
      preferences: (row.preferences as Record<string, unknown>) ?? {},
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
