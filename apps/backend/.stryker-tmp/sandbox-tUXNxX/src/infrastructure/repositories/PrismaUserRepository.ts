// @ts-nocheck
import { User } from '../../domain/entities/User';
import type { UserStatus } from '../../domain/types';
import { IUserRepository } from '../../domain/interfaces/IUserRepository';
import type { UserStatus as PrismaUserStatus } from '@prisma/client';
import { prisma } from '../database/prisma';
import { getDefaultTenantId } from '../../common/tenant';

/** Domain UserStatus -> Prisma enum (DB'de INACTIVE/DELETED yok, SUSPENDED kullan) */
function toPrismaStatus(s: UserStatus): PrismaUserStatus {
  if (s === 'INACTIVE' || s === 'DELETED') return 'SUSPENDED';
  return s as PrismaUserStatus;
}

/**
 * Prisma User Repository
 * Kritik işlemler $transaction içinde atomic yapılır
 */
export class PrismaUserRepository implements IUserRepository {
  async save(user: User): Promise<User> {
    return prisma.$transaction(async (tx) => {
      // Unique constraint: email kontrolü (atomic)
      const existingByEmail = await tx.user.findUnique({
        where: { email: user.email.toLowerCase() },
      });
      if (existingByEmail && existingByEmail.id !== user.id) {
        throw new Error('DUPLICATE_EMAIL');
      }

      // Unique constraint: username kontrolü (atomic)
      const existingByUsername = await tx.user.findUnique({
        where: { username: user.username },
      });
      if (existingByUsername && existingByUsername.id !== user.id) {
        throw new Error('DUPLICATE_USERNAME');
      }

      const status = toPrismaStatus(user.status);
      const tenantId = (user as any).tenantId ?? getDefaultTenantId();
      const created = await tx.user.upsert({
        where: { id: user.id },
        create: {
          id: user.id,
          email: user.email.toLowerCase(),
          username: user.username,
          passwordHash: user.passwordHash,
          role: user.role,
          status,
          tenantId,
          educatorApprovedAt: user.educatorApprovedAt ?? undefined,
          metadata: (user.metadata ?? {}) as any,
        },
        update: {
          email: user.email.toLowerCase(),
          username: user.username,
          passwordHash: user.passwordHash,
          role: user.role,
          status,
          educatorApprovedAt: user.educatorApprovedAt ?? undefined,
          metadata: (user.metadata ?? {}) as any,
        },
      });

      return this.toDomain(created);
    });
  }

  async findByEmail(email: string): Promise<User | null> {
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });
    return user ? this.toDomain(user) : null;
  }

  async findByUsername(username: string): Promise<User | null> {
    const user = await prisma.user.findUnique({
      where: { username },
    });
    return user ? this.toDomain(user) : null;
  }

  async findById(id: string): Promise<User | null> {
    const user = await prisma.user.findUnique({
      where: { id },
    });
    return user ? this.toDomain(user) : null;
  }

  async updateLastLoginAt(userId: string, date: Date): Promise<void> {
    await prisma.user.update({ where: { id: userId }, data: { lastLoginAt: date as any } as any });
  }

  async listInactiveUsersWithOpenAttempts(days: number): Promise<{ userId: string; attemptId: string }[]> {
    const cutoff = new Date(Date.now() - days * 24 * 3600 * 1000);
    const rows = await prisma.testAttempt.findMany({
      where: {
        status: 'IN_PROGRESS',
        startedAt: { lt: cutoff },
      },
      select: { candidateId: true, id: true },
    });
    return rows.map((r) => ({ userId: r.candidateId, attemptId: r.id }));
  }

  async updateEducatorProfile(userId: string, data: { metadata?: Record<string, unknown> }): Promise<User | null> {
    if (!data.metadata || Object.keys(data.metadata).length === 0) return this.findById(userId);
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return null;
    const merged = { ...((user.metadata as Record<string, unknown>) ?? {}), ...data.metadata };
    await prisma.user.update({
      where: { id: userId },
      data: { metadata: merged as any },
    });
    return this.findById(userId);
  }

  async updateEducatorStatus(
    userId: string,
    data: { status: UserStatus; educatorApprovedAt?: Date | null },
  ): Promise<User | null> {
    const prismaStatus = toPrismaStatus(data.status);
    const updateData: { status: PrismaUserStatus; educatorApprovedAt?: Date | null } = {
      status: prismaStatus,
      ...(data.educatorApprovedAt !== undefined && {
        educatorApprovedAt: data.educatorApprovedAt ?? null,
      }),
    };
    const updated = await prisma.user.updateMany({
      where: { id: userId },
      data: updateData,
    });
    if (updated.count === 0) return null;
    return this.findById(userId);
  }

  async list(params?: {
    q?: string;
    role?: string;
    status?: UserStatus;
    limit?: number;
    offset?: number;
    sort?: 'createdAt' | '-createdAt';
  }): Promise<User[]> {
    const q = params?.q?.trim();
    const role = params?.role?.toUpperCase();
    const status = params?.status;
    const limit = Math.min(Math.max(params?.limit ?? 200, 1), 500);
    const offset = Math.max(params?.offset ?? 0, 0);
    const sort = params?.sort ?? '-createdAt';

    const rows = await prisma.user.findMany({
      where: {
        ...(q && {
          OR: [
            { email: { contains: q, mode: 'insensitive' } },
            { username: { contains: q, mode: 'insensitive' } },
          ],
        }),
        ...(role && { role: role as any }),
        ...(status && { status: toPrismaStatus(status) as any }),
      } as any,
      include: { workerPermission: true },
      orderBy: { createdAt: sort === 'createdAt' ? 'asc' : 'desc' } as any,
      take: limit,
      skip: offset,
    });
    return rows.map((r) => {
      const base = this.toDomain(r as any);
      if (r.role === 'WORKER') {
        (base as any).workerPages = (r as any).workerPermission?.pages ?? [];
      }
      return base;
    });
  }

  async updateByAdmin(
    userId: string,
    data: {
      role?: User['role'];
      status?: UserStatus;
      educatorApprovedAt?: Date | null;
      metadataMerge?: Record<string, unknown>;
    },
  ): Promise<User | null> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return null;

    const mergedMeta = data.metadataMerge
      ? { ...((user.metadata as Record<string, unknown>) ?? {}), ...data.metadataMerge }
      : ((user.metadata as Record<string, unknown>) ?? {});

    const updateData: any = {
      ...(data.role != null && { role: data.role }),
      ...(data.status != null && { status: toPrismaStatus(data.status) }),
      ...(data.educatorApprovedAt !== undefined && { educatorApprovedAt: data.educatorApprovedAt ?? null }),
      ...(data.metadataMerge && { metadata: mergedMeta }),
    };

    await prisma.user.update({
      where: { id: userId },
      data: updateData,
    });
    return this.findById(userId);
  }

  async setPasswordResetToken(userId: string, token: string, expiresAt: Date): Promise<void> {
    await prisma.user.update({
      where: { id: userId },
      data: {
        passwordResetToken: token,
        passwordResetTokenExpiresAt: expiresAt,
      } as any,
    });
  }

  async findByPasswordResetToken(token: string): Promise<User | null> {
    const user = await prisma.user.findUnique({
      where: { passwordResetToken: token } as any,
    });
    return user ? this.toDomain(user as any) : null;
  }

  async resetPassword(userId: string, newPasswordHash: string): Promise<void> {
    await prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash: newPasswordHash,
        passwordResetToken: null,
        passwordResetTokenExpiresAt: null,
      } as any,
    });
  }

  private toDomain(row: {
    id: string;
    email: string;
    username: string;
    passwordHash: string;
    role: string;
    status?: string | null;
    educatorApprovedAt?: Date | null;
    passwordResetToken?: string | null;
    passwordResetTokenExpiresAt?: Date | null;
    metadata?: any;
    createdAt: Date;
    updatedAt: Date;
  }): User & { passwordResetTokenExpiresAt?: Date | null } {
    return {
      id: row.id,
      email: row.email,
      username: row.username,
      passwordHash: row.passwordHash,
      role: row.role as User['role'],
      status: (row.status as User['status']) ?? 'ACTIVE',
      educatorApprovedAt: row.educatorApprovedAt ?? undefined,
      passwordResetTokenExpiresAt: row.passwordResetTokenExpiresAt ?? null,
      metadata: (row.metadata as Record<string, unknown>) ?? {},
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
