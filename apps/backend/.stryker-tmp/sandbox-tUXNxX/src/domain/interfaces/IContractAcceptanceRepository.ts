// @ts-nocheck
export type ContractAcceptanceModel = {
  id: string;
  userId: string;
  contractId: string;
  acceptedAt: Date;
  ip?: string | null;
  userAgent?: string | null;
};

export interface IContractAcceptanceRepository {
  findByUserAndContract(userId: string, contractId: string): Promise<ContractAcceptanceModel | null>;
  create(input: {
    userId: string;
    contractId: string;
    ip?: string;
    userAgent?: string;
  }): Promise<ContractAcceptanceModel>;
}
