// @ts-nocheck
import type { IContractRepository } from '../../../domain/interfaces/IContractRepository';
import type { ContractType } from '../../../domain/types';

/** Sözleşmeleri listeler; tür filtresi opsiyoneldir (TERMS, PRIVACY vb.) */
export class ListContractsUseCase {
  constructor(private readonly contractRepo: IContractRepository) {}

  async execute(type?: ContractType) {
    return this.contractRepo.list(type);
  }
}
