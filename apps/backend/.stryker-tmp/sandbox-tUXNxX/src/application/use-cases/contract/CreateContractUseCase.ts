// @ts-nocheck
import type { IContractRepository } from '../../../domain/interfaces/IContractRepository';
import { AppError } from '../../errors/AppError';

/**
 * Sistemde yeni bir sözleşme versiyonu oluşturur.
 *
 * Sözleşme tipi CANDIDATE (aday) veya EDUCATOR (eğitici) olabilir.
 * Aynı tip ve versiyon numarasına sahip sözleşme zaten varsa 409 hatası fırlatılır.
 * Yeni oluşturulan sözleşmeler varsayılan olarak pasif (isActive: false) gelir;
 * aktifleştirme ayrı bir işlemle yapılmalıdır.
 */
export class CreateContractUseCase {
  constructor(private readonly contractRepo: IContractRepository) {}

  /**
   * Yeni sözleşmeyi doğrulayıp veritabanına kaydeder.
   *
   * @param input.type      - Sözleşme tipi: 'CANDIDATE' veya 'EDUCATOR'
   * @param input.version   - Versiyon numarası (en az 1, aynı tip için benzersiz olmalı)
   * @param input.title     - Sözleşme başlığı (boş olamaz)
   * @param input.content   - Sözleşme içeriği (boş olamaz)
   * @param input.isActive  - Aktif mi? (varsayılan: false)
   */
  async execute(input: { type: string; version: number; title: string; content: string; isActive?: boolean }) {
    if (!input.title?.trim()) throw new AppError('INVALID_INPUT', 'Title required', 400);
    if (!input.content?.trim()) throw new AppError('INVALID_INPUT', 'Content required', 400);
    if (input.type !== 'CANDIDATE' && input.type !== 'EDUCATOR') throw new AppError('INVALID_INPUT', 'Type must be CANDIDATE or EDUCATOR', 400);
    if (typeof input.version !== 'number' || input.version < 1) throw new AppError('INVALID_INPUT', 'Version must be >= 1', 400);

    // Aynı tip için versiyon çakışması kontrolü
    const list = await this.contractRepo.list(input.type as 'CANDIDATE' | 'EDUCATOR');
    const versionExists = list.some((c) => c.version === input.version);
    if (versionExists) throw new AppError('VERSION_EXISTS', `Contract version ${input.version} already exists for type ${input.type}`, 409);

    return this.contractRepo.create({
      type: input.type as 'CANDIDATE' | 'EDUCATOR',
      version: input.version,
      title: input.title.trim(),
      content: input.content.trim(),
      isActive: input.isActive ?? false,
    });
  }
}
