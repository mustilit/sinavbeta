// @ts-nocheck
import { prisma } from '../database/prisma';
import { IRefundRepository, RefundRequest, RefundListItem, RefundStatus } from '../../domain/interfaces/IRefundRepository';

export class PrismaRefundRepository implements IRefundRepository {
  async create(input: {
    purchaseId: string;
    candidateId: string;
    educatorId: string;
    testId: string;
    reason?: string;
    description?: string;
    educatorDeadline?: Date;
  }): Promise<RefundRequest> {
    const r = await prisma.refundRequest.create({
      data: {
        purchaseId: input.purchaseId,
        candidateId: input.candidateId,
        educatorId: input.educatorId,
        testId: input.testId,
        reason: input.reason ?? null,
        description: input.description ?? null,
        educatorDeadline: input.educatorDeadline ?? null,
      } as any,
    });
    return this.toDomain(r);
  }

  async findByPurchaseId(purchaseId: string): Promise<RefundRequest | null> {
    const r = await prisma.refundRequest.findUnique({ where: { purchaseId } as any });
    return r ? this.toDomain(r) : null;
  }

  async findById(id: string): Promise<RefundRequest | null> {
    const r = await prisma.refundRequest.findUnique({ where: { id } });
    return r ? this.toDomain(r) : null;
  }

  async findByCandidateId(candidateId: string): Promise<RefundListItem[]> {
    const rows = await prisma.refundRequest.findMany({
      where: { candidateId },
      orderBy: { createdAt: 'desc' },
    });
    return this.toListWithTestTitle(rows);
  }

  async findByStatus(status: RefundStatus): Promise<RefundListItem[]> {
    const rows = await prisma.refundRequest.findMany({
      where: { status } as any,
      orderBy: { createdAt: 'desc' },
    });
    return this.toListWithTestTitle(rows);
  }

  async findByStatuses(statuses: RefundStatus[]): Promise<RefundListItem[]> {
    const rows = await prisma.refundRequest.findMany({
      where: { status: { in: statuses } } as any,
      orderBy: { createdAt: 'desc' },
    });
    return this.toListWithTestTitle(rows);
  }

  async findByEducatorId(educatorId: string): Promise<RefundListItem[]> {
    const rows = await prisma.refundRequest.findMany({
      where: {
        educatorId,
        status: { in: ['PENDING', 'EDUCATOR_APPROVED', 'EDUCATOR_REJECTED'] },
      } as any,
      orderBy: { createdAt: 'desc' },
    });
    return this.toListWithTestTitle(rows);
  }

  async updateStatus(id: string, status: 'APPROVED' | 'REJECTED', decidedBy: string): Promise<RefundRequest> {
    const r = await prisma.refundRequest.update({
      where: { id },
      data: { status, decidedBy, decidedAt: new Date() } as any,
    });
    return this.toDomain(r);
  }

  async approve(refundId: string, adminId: string, decidedAt: Date, adminNotes?: string): Promise<RefundRequest> {
    const refundRow = await prisma.refundRequest.findUnique({ where: { id: refundId } });
    if (!refundRow) throw new Error('REFUND_NOT_FOUND');

    const r = await prisma.$transaction(async (tx) => {
      const updated = await tx.refundRequest.update({
        where: { id: refundId },
        data: { status: 'APPROVED', decidedBy: adminId, decidedAt, adminNotes: adminNotes ?? null } as any,
      });
      await tx.purchase.update({
        where: { id: (refundRow as any).purchaseId },
        data: { status: 'REFUNDED' } as any,
      });
      await tx.auditLog.create({
        data: {
          action: 'REFUND_APPROVED',
          entityType: 'RefundRequest',
          entityId: refundId,
          actorId: adminId,
          metadata: { purchaseId: (refundRow as any).purchaseId },
        } as any,
      });
      return updated;
    });
    return this.toDomain(r);
  }

  async reject(refundId: string, adminId: string, decidedAt: Date, reason?: string): Promise<RefundRequest> {
    const r = await prisma.$transaction(async (tx) => {
      const updated = await tx.refundRequest.update({
        where: { id: refundId },
        data: { status: 'REJECTED', decidedBy: adminId, decidedAt, adminNotes: reason ?? null } as any,
      });
      await tx.auditLog.create({
        data: {
          action: 'REFUND_REJECTED',
          entityType: 'RefundRequest',
          entityId: refundId,
          actorId: adminId,
          metadata: {},
        } as any,
      });
      return updated;
    });
    return this.toDomain(r);
  }

  async educatorApprove(refundId: string, educatorId: string): Promise<RefundRequest> {
    const r = await prisma.refundRequest.update({
      where: { id: refundId },
      data: { status: 'EDUCATOR_APPROVED', educatorDecidedAt: new Date() } as any,
    });
    return this.toDomain(r);
  }

  async educatorReject(refundId: string, _educatorId: string, reason?: string): Promise<RefundRequest> {
    const r = await prisma.refundRequest.update({
      where: { id: refundId },
      data: {
        status: 'EDUCATOR_REJECTED',
        educatorDecidedAt: new Date(),
        adminNotes: reason ?? null,
      } as any,
    });
    return this.toDomain(r);
  }

  async appeal(refundId: string, _candidateId: string, appealReason?: string): Promise<RefundRequest> {
    const r = await prisma.refundRequest.update({
      where: { id: refundId },
      data: {
        status: 'APPEAL_PENDING',
        appealedAt: new Date(),
        appealReason: appealReason ?? null,
      } as any,
    });
    return this.toDomain(r);
  }

  async escalateOverdue(): Promise<number> {
    const result = await prisma.refundRequest.updateMany({
      where: {
        status: 'PENDING',
        educatorDeadline: { lt: new Date() },
      } as any,
      data: { status: 'ESCALATED' } as any,
    });
    return result.count;
  }

  private toDomain(row: any): RefundRequest {
    return {
      id: row.id,
      purchaseId: row.purchaseId,
      candidateId: row.candidateId,
      educatorId: row.educatorId ?? '',
      testId: row.testId,
      reason: row.reason,
      description: row.description ?? null,
      status: row.status as RefundStatus,
      educatorDeadline: row.educatorDeadline ? new Date(row.educatorDeadline).toISOString() : null,
      educatorDecidedAt: row.educatorDecidedAt ? new Date(row.educatorDecidedAt).toISOString() : null,
      appealReason: row.appealReason ?? null,
      appealedAt: row.appealedAt ? new Date(row.appealedAt).toISOString() : null,
      decidedBy: row.decidedBy,
      decidedAt: row.decidedAt ? new Date(row.decidedAt).toISOString() : null,
      adminNotes: row.adminNotes ?? null,
      createdAt: new Date(row.createdAt).toISOString(),
      updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : undefined,
    };
  }

  private async toListWithTestTitle(rows: any[]): Promise<RefundListItem[]> {
    if (rows.length === 0) return [];
    const testIds = [...new Set(rows.map((r) => r.testId))];
    const tests = await prisma.examTest.findMany({
      where: { id: { in: testIds } },
      select: { id: true, title: true },
    });
    const titleByTestId = new Map(tests.map((t) => [t.id, t.title]));
    return rows.map((row) => ({
      ...this.toDomain(row),
      testTitle: titleByTestId.get(row.testId) ?? null,
    }));
  }
}
