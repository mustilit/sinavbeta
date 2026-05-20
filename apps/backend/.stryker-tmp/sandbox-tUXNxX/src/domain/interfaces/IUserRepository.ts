// @ts-nocheck
import { User } from '../entities/User';
import { UserStatus } from '../types';

export interface IUserRepository {
  save(user: User): Promise<User>;
  findByEmail(email: string): Promise<User | null>;
  findByUsername(username: string): Promise<User | null>;
  findById(id: string): Promise<User | null>;
  updateLastLoginAt(userId: string, date: Date): Promise<void>;
  listInactiveUsersWithOpenAttempts(days: number): Promise<
    { userId: string; attemptId: string }[]
  >;
  updateEducatorStatus(
    userId: string,
    data: { status: UserStatus; educatorApprovedAt?: Date | null },
  ): Promise<User | null>;
  updateEducatorProfile(userId: string, data: { metadata?: Record<string, unknown> }): Promise<User | null>;

  /**
   * Admin: list users for management UI.
   * Kept intentionally minimal for frontend needs.
   */
  list(params?: {
    q?: string;
    role?: string;
    status?: UserStatus;
    limit?: number;
    offset?: number;
    sort?: 'createdAt' | '-createdAt';
  }): Promise<User[]>;

  /**
   * Admin: partial update for management UI (role/status/metadata merge).
   */
  updateByAdmin(
    userId: string,
    data: {
      role?: User['role'];
      status?: UserStatus;
      educatorApprovedAt?: Date | null;
      metadataMerge?: Record<string, unknown>;
    },
  ): Promise<User | null>;

  setPasswordResetToken(userId: string, token: string, expiresAt: Date): Promise<void>;
  findByPasswordResetToken(token: string): Promise<User | null>;
  resetPassword(userId: string, newPasswordHash: string): Promise<void>;
}
