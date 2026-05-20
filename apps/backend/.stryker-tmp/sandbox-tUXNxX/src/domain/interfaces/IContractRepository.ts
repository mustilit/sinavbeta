// @ts-nocheck
import type { ContractType } from '../types';

export type ContractModel = {
  id: string;
  type: ContractType;
  version: number;
  title: string;
  content: string;
  isActive: boolean;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export interface CreateContractInput {
  type: ContractType;
  version: number;
  title: string;
  content: string;
  isActive?: boolean;
}

export interface IContractRepository {
  getActiveByType(type: ContractType): Promise<ContractModel | null>;
  getById(id: string): Promise<ContractModel | null>;
  list(type?: ContractType): Promise<ContractModel[]>;
  create(input: CreateContractInput): Promise<ContractModel>;
  update(id: string, data: { title?: string; content?: string; isActive?: boolean }): Promise<ContractModel | null>;
  setActive(type: ContractType, contractId: string): Promise<ContractModel>;
}
