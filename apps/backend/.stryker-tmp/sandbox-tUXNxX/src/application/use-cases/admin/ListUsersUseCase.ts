// @ts-nocheck
import { AppError } from '../../errors/AppError';
import type { IUserRepository } from '../../../domain/interfaces/IUserRepository';
import type { UserStatus } from '../../../domain/types';

/**
 * Admin paneli için kullanıcıları listeler.
 * Metin arama, rol, statü ve sıralama filtreleri destekler.
 */
export class ListUsersUseCase {
  constructor(private readonly userRepo: IUserRepository) {}

  /**
   * Kullanıcıları parametrelere göre filtreler ve döner.
   * @param params.q      - Ad/e-posta metin araması (opsiyonel).
   * @param params.role   - Kullanıcı rolü filtresi (opsiyonel).
   * @param params.status - Kullanıcı statüsü filtresi (opsiyonel).
   * @param params.limit  - Sayfa boyutu (opsiyonel).
   * @param params.offset - Sayfalama başlangıcı (opsiyonel).
   * @param params.sort   - Sıralama yönü: 'createdAt' veya '-createdAt' (opsiyonel).
   */
  async execute(params?: {
    q?: string;
    role?: string;
    status?: UserStatus;
    limit?: number;
    offset?: number;
    sort?: 'createdAt' | '-createdAt';
  }) {
    try {
      return await this.userRepo.list(params);
    } catch (e: any) {
      throw new AppError('LIST_USERS_FAILED', e?.message || 'List users failed', 500);
    }
  }
}

