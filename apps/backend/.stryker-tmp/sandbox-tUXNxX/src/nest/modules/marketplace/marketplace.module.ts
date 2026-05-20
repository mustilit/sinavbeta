// @ts-nocheck
import { Module } from '@nestjs/common';
import { MarketplaceController } from './marketplace.controller';
import { ListMarketplaceTestsUseCase } from '../../../application/use-cases/test/ListMarketplaceTestsUseCase';
import { ListMarketplacePackagesUseCase } from '../../../application/use-cases/package/ListMarketplacePackagesUseCase';
import { GetMarketplacePackageUseCase } from '../../../application/use-cases/package/GetMarketplacePackageUseCase';
import { PrismaExamRepository } from '../../../infrastructure/repositories/PrismaExamRepository';

@Module({
  controllers: [MarketplaceController],
  providers: [
    {
      provide: ListMarketplaceTestsUseCase,
      useFactory: () => new ListMarketplaceTestsUseCase(new PrismaExamRepository()),
    },
    {
      provide: ListMarketplacePackagesUseCase,
      useFactory: () => new ListMarketplacePackagesUseCase(),
    },
    {
      provide: GetMarketplacePackageUseCase,
      useFactory: () => new GetMarketplacePackageUseCase(),
    },
  ],
  exports: [ListMarketplaceTestsUseCase, ListMarketplacePackagesUseCase, GetMarketplacePackageUseCase],
})
export class MarketplaceModule {}

