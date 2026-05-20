import { Injectable } from '@nestjs/common';
import { ModerationCategory } from '@prisma/client';
import { prisma } from '../database/prisma';
import {
  CreateModerationViolationData,
  IModerationViolationRepository,
  ModerationViolationRecord,
} from '../../domain/interfaces/IModerationViolationRepository';

const VIOLATION_SELECT = {
  id: true,
  tenantId: true,
  userId: true,
  moderationResultId: true,
  category: true,
  severity: true,
  status: true,
  entityType: true,
  entityId: true,
  adminNote: true,
  reviewedBy: true,
  reviewedAt: true,
  resolvedAt: true,
  createdAt: true,
} as const;

@Injectable()
export class PrismaModerationViolationRepository
  implements IModerationViolationRepository
{
  async create(data: CreateModerationViolationData): Promise<ModerationViolationRecord> {
    return prisma.moderationViolation.create({
      data: {
        tenantId: data.tenantId,
        userId: data.userId,
        moderationResultId: data.moderationResultId ?? null,
        category: data.category,
        severity: data.severity,
        entityType: data.entityType,
        entityId: data.entityId,
        adminNote: data.adminNote ?? null,
        status: 'OPEN',
      },
      select: VIOLATION_SELECT,
    });
  }

  async findById(id: string): Promise<ModerationViolationRecord | null> {
    return prisma.moderationViolation.findUnique({
      where: { id },
      select: VIOLATION_SELECT,
    });
  }

  async findByUser(
    userId: string,
    opts?: { limit?: number; sinceDate?: Date },
  ): Promise<ModerationViolationRecord[]> {
    return prisma.moderationViolation.findMany({
      where: {
        userId,
        ...(opts?.sinceDate && { createdAt: { gte: opts.sinceDate } }),
      },
      select: VIOLATION_SELECT,
      orderBy: { createdAt: 'desc' },
      take: opts?.limit ?? 100,
    });
  }

  async findByModerationResult(
    moderationResultId: string,
  ): Promise<ModerationViolationRecord | null> {
    return prisma.moderationViolation.findFirst({
      where: { moderationResultId },
      select: VIOLATION_SELECT,
    });
  }

  async updateStatus(
    id: string,
    status: string,
    reviewedBy?: string,
    adminNote?: string,
  ): Promise<ModerationViolationRecord> {
    return prisma.moderationViolation.update({
      where: { id },
      data: {
        status,
        reviewedBy: reviewedBy ?? undefined,
        reviewedAt: new Date(),
        adminNote: adminNote ?? undefined,
      },
      select: VIOLATION_SELECT,
    });
  }

  async markResolved(id: string): Promise<ModerationViolationRecord> {
    return prisma.moderationViolation.update({
      where: { id },
      data: { resolvedAt: new Date(), status: 'CONFIRMED' },
      select: VIOLATION_SELECT,
    });
  }

  async findOpenByUser(
    userId: string,
    tenantId: string,
    since?: Date,
  ): Promise<ModerationViolationRecord[]> {
    return prisma.moderationViolation.findMany({
      where: {
        userId,
        tenantId,
        status: { in: ['OPEN', 'CONFIRMED'] },
        ...(since && { createdAt: { gte: since } }),
      },
      select: VIOLATION_SELECT,
      orderBy: { createdAt: 'desc' },
    });
  }
}
