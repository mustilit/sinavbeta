// @ts-nocheck
import type { IContractRepository } from '../../../domain/interfaces/IContractRepository';
import type { ContractType } from '../../../domain/types';
import { AppError } from '../../errors/AppError';

/**
 * Aktif (yayınlanmış) sözleşmeyi türüne göre getirir.
 * Kayıt yoksa 404 fırlatır — frontend kayıt dışı bırakmayı engelleyebilir.
 */
export class GetActiveContractUseCase {
  constructor(private readonly contractRepo: IContractRepository) {}

  async execute(params: { type: ContractType }): Promise<{
    id: string;
    type: ContractType;
    version: number;
    title: string;
    content: string;
    publishedAt: string | null;
  }> {
    const contract = await this.contractRepo.getActiveByType(params.type);
    if (!contract) {
      throw new AppError('CONTRACT_NOT_FOUND', 'Active contract not found', 404);
    }
    return {
      id: contract.id,
      type: contract.type,
      version: contract.version,
      title: contract.title,
      content: contract.content,
      publishedAt: contract.publishedAt ? contract.publishedAt.toISOString() : null,
    };
  }
}
