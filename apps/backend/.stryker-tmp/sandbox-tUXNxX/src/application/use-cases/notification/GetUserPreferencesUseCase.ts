// @ts-nocheck
import { AppError } from '../../errors/AppError';
import type { IUserPreferenceRepository } from '../../../domain/interfaces/IUserPreferenceRepository';

/**
 * Kullanıcının tercihler JSON'ını döner.
 * Tercihler: tema, dil, interested_exam_types, onboarding flags, IBAN, biyografi vb.
 * Kayıt yoksa boş obje ({}) ile fail-open çalışır.
 */
export class GetUserPreferencesUseCase {
  constructor(private readonly repo: IUserPreferenceRepository) {}

  async execute(userId: string | undefined): Promise<Record<string, unknown>> {
    if (!userId) throw new AppError('UNAUTHORIZED', 'Authentication required', 401);
    const pref = await this.repo.findByUserId(userId);
    // preferences alanı bulunamazsa boş obje dön — frontend null kontrolü yapmak zorunda kalmasın
    return pref?.preferences ?? {};
  }
}
