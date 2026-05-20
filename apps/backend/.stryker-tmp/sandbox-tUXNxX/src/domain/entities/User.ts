/**
 * Kullanıcı Entity
 * RBAC için rol bilgisi içerir
 */
// @ts-nocheck

import { UserStatus, UserRole } from '../types';

export interface User {
  id: string;
  email: string;
  username: string;
  passwordHash: string;
  role: UserRole;
  status: UserStatus;
  educatorApprovedAt?: Date | null;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserPublic {
  id: string;
  email: string;
  username: string;
  role: UserRole;
  status: UserStatus;
  createdAt: Date;
}
