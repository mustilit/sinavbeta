import { prisma } from '../database/prisma';
import { IRefundRepository, RefundRequest, RefundListItem, RefundStatus, RefundSource } from '../../domain/interfaces/IRefundRepository';

export class PrismaRefundRepository implements IRefundRepository {
  async create(input: {
    source?: RefundSource;
    purchaseId?: string | null;
    tunnelPurchaseId?: string | null;
    writtenPurchaseId?: string | null;
    tunnelId?: string | null;
    writtenPackageId?: string | null;
    candidateId: string;
    educatorId: string;
    testId?: string | null;
    reason?: string;
    description?: string;
    educatorDeadline?: Date;
  }): Promise<RefundRequest> {
    const r = await prisma.refundRequest.create({
      data: {
        source: input.source ?? 'TEST',
        purchaseId: input.purchaseId ?? null,
        tunnelPurchaseId: input.tunnelPurchaseId ?? null,
        writtenPurchaseId: input.writtenPurchaseId ?? null,
        tunnelId: input.tunnelId ?? null,
        writtenPackageId: input.writtenPackageId ?? null,
        candidateId: input.candidateId,
        educatorId: input.educatorId,
        testId: input.testId ?? null,
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

  async findBySourcePurchaseId(source: RefundSource, sourcePurchaseId: string): Promise<RefundRequest | null> {
    const where =
      source === 'TUNNEL'
        ? { tunnelPurchaseId: sourcePurchaseId }
        : source === 'WRITTEN'
          ? { writtenPurchaseId: sourcePurchaseId }
          : { purchaseId: sourcePurchaseId };
    const r = await prisma.refundRequest.findUnique({ where: where as any });
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

    const source = (refundRow as any).source ?? 'TEST';
    const r = await prisma.$transaction(async (tx) => {
      const updated = await tx.refundRequest.update({
        where: { id: refundId },
        data: { status: 'APPROVED', decidedBy: adminId, decidedAt, adminNotes: adminNotes ?? null } as any,
      });
      // Kaynağa göre doğru satın alma satırını REFUNDED işaretle (her tablonun refundedAt'i var)
      let refundedPurchaseId: string | null = null;
      if (source === 'TUNNEL' && (refundRow as any).tunnelPurchaseId) {
        refundedPurchaseId = (refundRow as any).tunnelPurchaseId;
        await tx.tunnelPurchase.update({
          where: { id: refundedPurchaseId as string },
          data: { status: 'REFUNDED', refundedAt: decidedAt } as any,
        });
      } else if (source === 'WRITTEN' && (refundRow as any).writtenPurchaseId) {
        refundedPurchaseId = (refundRow as any).writtenPurchaseId;
        await tx.writtenPurchase.update({
          where: { id: refundedPurchaseId as string },
          data: { status: 'REFUNDED', refundedAt: decidedAt } as any,
        });
      } else if ((refundRow as any).purchaseId) {
        refundedPurchaseId = (refundRow as any).purchaseId;
        await tx.purchase.update({
          where: { id: refundedPurchaseId as string },
          data: { status: 'REFUNDED', refundedAt: decidedAt } as any,
        });
      }
      await tx.auditLog.create({
        data: {
          action: 'REFUND_APPROVED',
          entityType: 'RefundRequest',
          entityId: refundId,
          actorId: adminId,
          metadata: { source, purchaseId: refundedPurchaseId },
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
      source: (row.source ?? 'TEST') as RefundSource,
      purchaseId: row.purchaseId ?? null,
      tunnelPurchaseId: row.tunnelPurchaseId ?? null,
      writtenPurchaseId: row.writtenPurchaseId ?? null,
      tunnelId: row.tunnelId ?? null,
      writtenPackageId: row.writtenPackageId ?? null,
      candidateId: row.candidateId,
      educatorId: row.educatorId ?? '',
      testId: row.testId ?? null,
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

    // Kaynağa göre başlık çöz: TEST → ExamTest.title; TUNNEL → Tunnel.title; WRITTEN → WrittenPackage.title
    const testIds = [...new Set(rows.filter((r) => (r.source ?? 'TEST') === 'TEST' && r.testId).map((r) => r.testId))];
    const tunnelIds = [...new Set(rows.filter((r) => r.source === 'TUNNEL' && r.tunnelId).map((r) => r.tunnelId))];
    const writtenIds = [...new Set(rows.filter((r) => r.source === 'WRITTEN' && r.writtenPackageId).map((r) => r.writtenPackageId))];

    const [tests, tunnels, writtens] = await Promise.all([
      testIds.length ? prisma.examTest.findMany({ where: { id: { in: testIds } }, select: { id: true, title: true } }) : Promise.resolve([] as { id: string; title: string }[]),
      tunnelIds.length ? prisma.tunnel.findMany({ where: { id: { in: tunnelIds } }, select: { id: true, title: true } }) : Promise.resolve([] as { id: string; title: string }[]),
      writtenIds.length ? prisma.writtenPackage.findMany({ where: { id: { in: writtenIds } }, select: { id: true, title: true } }) : Promise.resolve([] as { id: string; title: string }[]),
    ]);
    const titleByTestId = new Map(tests.map((t) => [t.id, t.title]));
    const titleByTunnelId = new Map(tunnels.map((t) => [t.id, t.title]));
    const titleByWrittenId = new Map(writtens.map((w) => [w.id, w.title]));

    return rows.map((row) => {
      const source = row.source ?? 'TEST';
      const testTitle =
        source === 'TUNNEL'
          ? titleByTunnelId.get(row.tunnelId) ?? null
          : source === 'WRITTEN'
            ? titleByWrittenId.get(row.writtenPackageId) ?? null
            : titleByTestId.get(row.testId) ?? null;
      return { ...this.toDomain(row), testTitle };
    });
  }
}
