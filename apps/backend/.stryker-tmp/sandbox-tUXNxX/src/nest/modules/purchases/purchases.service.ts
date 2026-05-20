// @ts-nocheck
import { Injectable } from '@nestjs/common';
import { PurchaseUseCase } from '../../../application/use-cases/purchase/PurchaseUseCase';
import { Inject } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';

@Injectable()
export class PurchasesService {
  constructor(@Inject('PRISMA') private readonly prisma: PrismaClient) {}

  async purchase(testId: string, candidateId: string, discountCode?: string, paymentProvider?: string) {
    const uc = new PurchaseUseCase(this.prisma);
    return uc.execute(testId, candidateId, discountCode, paymentProvider);
  }
}

