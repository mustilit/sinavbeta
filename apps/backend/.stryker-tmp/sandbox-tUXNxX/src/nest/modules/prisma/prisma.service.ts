// @ts-nocheck
import { Injectable, Inject, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  constructor(@Inject('PRISMA') public readonly client: PrismaClient) {
    const shutdown = async () => {
      try {
        await this.client.$disconnect();
      } catch {
        // ignore
      }
      process.exit(0);
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  }

  async onModuleInit() {
    await this.client.$connect();
  }

  async onModuleDestroy() {
    await this.client.$disconnect();
  }

  // convenience getters
  get examTest() {
    return this.client.examTest;
  }

  get auditLog() {
    return this.client.auditLog;
  }

  get purchase() {
    return this.client.purchase;
  }

  get testAttempt() {
    return this.client.testAttempt;
  }

  // TODO: Multi-tenant enforcement:
  // Prisma çağrılarında request context'ten tenantId alıp,
  // findMany / findFirst / update vb. işlemlere otomatik tenant filter ekle.
}

