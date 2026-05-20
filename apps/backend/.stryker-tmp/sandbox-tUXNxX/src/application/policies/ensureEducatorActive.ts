// @ts-nocheck
import { AppError } from '../errors/AppError';
import type { User } from '../../domain/entities/User';
import type { UserStatus, UserRole } from '../../domain/types';

export type EducatorCheckInput =
  | User
  | { role: UserRole; status: UserStatus; educatorApprovedAt?: Date | null };

/**
 * Ensures the user is an active, approved educator (not suspended, educatorApprovedAt set).
 * Use before educator-only operations (e.g. publish test).
 * No Nest imports.
 */
export function ensureEducatorActive(input: EducatorCheckInput): void {
  const role = input.role;
  const status = input.status;
  const educatorApprovedAt = input.educatorApprovedAt;

  if (role !== 'EDUCATOR') {
    throw new AppError('USER_NOT_EDUCATOR', 'User is not an educator', 403);
  }
  if (status === 'SUSPENDED') {
    throw new AppError('EDUCATOR_SUSPENDED', 'Educator account is suspended', 403);
  }
  if (educatorApprovedAt == null) {
    throw new AppError('EDUCATOR_NOT_APPROVED', 'Educator has not been approved', 403);
  }
}
