// @ts-nocheck
import { Controller, Get, Param, Query, Req } from '@nestjs/common';
import { Roles } from '../decorators/roles.decorator';
import { GetPerformanceDistributionDto } from './dto/get-performance-distribution.dto';
import { GetPerformanceDistributionUseCase } from '../../application/use-cases/test/GetPerformanceDistributionUseCase';
import { PrismaAttemptRepository } from '../../infrastructure/repositories/PrismaAttemptRepository';

/**
 * Test performans dağılımı endpoint'i — adayın belirli bir testteki
 * puan dağılımını ve percentile bilgisini döndürür.
 * CANDIDATE rolüne kısıtlıdır.
 */
@Controller('tests')
export class TestsPerformanceController {
  private uc: GetPerformanceDistributionUseCase;
  constructor() {
    this.uc = new GetPerformanceDistributionUseCase(new PrismaAttemptRepository());
  }

  @Get(':id/performance-distribution')
  @Roles('CANDIDATE')
  async performance(@Param('id') id: string, @Query() q: GetPerformanceDistributionDto, @Req() req: any) {
    const candidateId = (req as any).user?.id;
    return this.uc.execute(id, candidateId, q.attemptId);
  }
}

