// @ts-nocheck
import { User } from '../../domain/entities/User';
import type { UserStatus } from '../../domain/types';
import { IUserRepository } from '../../domain/interfaces/IUserRepository';

/**
 * In-memory User Repository
 * Unique constraint: email ve username benzersiz olmalı
 */
export class InMemoryUserRepository implements IUserRepository {
  private users: Map<string, User & { passwordResetToken?: string | null; passwordResetTokenExpiresAt?: Date | null }> = new Map();
  private emailIndex: Map<string, string> = new Map();
  private usernameIndex: Map<string, string> = new Map();
  private resetTokenIndex: Map<string, string> = new Map();

  async save(user: User): Promise<User> {
    // Unique constraint: email kontrolü
    const existingByEmail = await this.findByEmail(user.email);
    if (existingByEmail && existingByEmail.id !== user.id) {
      throw new Error('DUPLICATE_EMAIL');
    }

    // Unique constraint: username kontrolü
    const existingByUsername = await this.findByUsername(user.username);
    if (existingByUsername && existingByUsername.id !== user.id) {
      throw new Error('DUPLICATE_USERNAME');
    }

    // Ensure status/metadata defaults for compatibility with new schema
    const toSave: User = {
      ...user,
      status: user.status ?? 'ACTIVE',
      metadata: user.metadata ?? {},
    };

    this.users.set(user.id, toSave);
    this.emailIndex.set(user.email.toLowerCase(), user.id);
    this.usernameIndex.set(user.username.toLowerCase(), user.id);

    return toSave;
  }

  async findByEmail(email: string): Promise<User | null> {
    const id = this.emailIndex.get(email.toLowerCase());
    return id ? this.users.get(id) ?? null : null;
  }

  async findByUsername(username: string): Promise<User | null> {
    const id = this.usernameIndex.get(username.toLowerCase());
    return id ? this.users.get(id) ?? null : null;
  }

  async findById(id: string): Promise<User | null> {
    return this.users.get(id) ?? null;
  }

  async updateLastLoginAt(_userId: string, _date: Date): Promise<void> {
    // no-op in memory
  }

  async listInactiveUsersWithOpenAttempts(_days: number): Promise<{ userId: string; attemptId: string }[]> {
    return [];
  }

  async updateEducatorProfile(userId: string, data: { metadata?: Record<string, unknown> }): Promise<User | null> {
    const user = this.users.get(userId);
    if (!user) return null;
    if (!data.metadata || Object.keys(data.metadata).length === 0) return user;
    const merged = { ...((user.metadata as Record<string, unknown>) ?? {}), ...data.metadata };
    const updated: User = { ...user, metadata: merged };
    this.users.set(userId, updated);
    return updated;
  }

  async updateEducatorStatus(
    userId: string,
    data: { status: UserStatus; educatorApprovedAt?: Date | null },
  ): Promise<User | null> {
    const user = this.users.get(userId);
    if (!user) return null;
    const updated: User = {
      ...user,
      status: data.status,
      ...(data.educatorApprovedAt !== undefined && { educatorApprovedAt: data.educatorApprovedAt }),
    };
    this.users.set(userId, updated);
    return updated;
  }

  async list(params?: {
    q?: string;
    role?: string;
    status?: UserStatus;
    limit?: number;
    offset?: number;
    sort?: 'createdAt' | '-createdAt';
  }): Promise<User[]> {
    const q = params?.q?.toLowerCase().trim();
    const role = params?.role?.toUpperCase();
    const status = params?.status;
    const limit = params?.limit ?? 200;
    const offset = params?.offset ?? 0;
    const sort = params?.sort ?? '-createdAt';

    let list = Array.from(this.users.values());
    if (q) {
      list = list.filter((u) => (u.email || '').toLowerCase().includes(q) || (u.username || '').toLowerCase().includes(q));
    }
    if (role) list = list.filter((u) => (u.role || '').toUpperCase() === role);
    if (status) list = list.filter((u) => u.status === status);

    list.sort((a, b) => {
      const av = new Date(a.createdAt || 0).getTime();
      const bv = new Date(b.createdAt || 0).getTime();
      return sort === 'createdAt' ? av - bv : bv - av;
    });

    return list.slice(offset, offset + limit);
  }

  async setPasswordResetToken(userId: string, token: string, expiresAt: Date): Promise<void> {
    const user = this.users.get(userId);
    if (!user) return;
    if (user.passwordResetToken) this.resetTokenIndex.delete(user.passwordResetToken);
    const updated = { ...user, passwordResetToken: token, passwordResetTokenExpiresAt: expiresAt };
    this.users.set(userId, updated);
    this.resetTokenIndex.set(token, userId);
  }

  async findByPasswordResetToken(token: string): Promise<User | null> {
    const userId = this.resetTokenIndex.get(token);
    if (!userId) return null;
    return this.users.get(userId) ?? null;
  }

  async resetPassword(userId: string, newPasswordHash: string): Promise<void> {
    const user = this.users.get(userId);
    if (!user) return;
    if (user.passwordResetToken) this.resetTokenIndex.delete(user.passwordResetToken);
    const updated = { ...user, passwordHash: newPasswordHash, passwordResetToken: null, passwordResetTokenExpiresAt: null };
    this.users.set(userId, updated);
  }

  async updateByAdmin(
    userId: string,
    data: { role?: User['role']; status?: UserStatus; educatorApprovedAt?: Date | null; metadataMerge?: Record<string, unknown> },
  ): Promise<User | null> {
    const user = this.users.get(userId);
    if (!user) return null;
    const mergedMeta = data.metadataMerge ? { ...(user.metadata ?? {}), ...data.metadataMerge } : (user.metadata ?? {});
    const updated: User = {
      ...user,
      ...(data.role != null && { role: data.role }),
      ...(data.status != null && { status: data.status }),
      ...(data.educatorApprovedAt !== undefined && { educatorApprovedAt: data.educatorApprovedAt ?? undefined }),
      metadata: mergedMeta,
      updatedAt: new Date(),
    };
    this.users.set(userId, updated);
    return updated;
  }
}
