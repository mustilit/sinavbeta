// @ts-nocheck
import { Controller, Get, Inject } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOkResponse, ApiForbiddenResponse } from '@nestjs/swagger';
import { Roles } from '../decorators/roles.decorator';
import { GetAdminStatsUseCase } from '../../application/use-cases/admin/GetAdminStatsUseCase';

/**
 * Admin istatistik dashboard — kullanıcı, paket ve satış aggregate sayılarını döner.
 * Yalnızca ADMIN rolüne açıktır.
 */
@Controller('admin/stats')
@ApiTags('admin/stats')
export class AdminStatsController {
  constructor(
    @Inject(GetAdminStatsUseCase) private readonly getAdminStats: GetAdminStatsUseCase,
  ) {}

  @Get()
  @Roles('ADMIN')
  @ApiBearerAuth('bearer')
  @ApiOkResponse({ description: 'Admin istatistikleri' })
  @ApiForbiddenResponse({ description: 'Forbidden' })
  async get() {
    return this.getAdminStats.execute();
  }
}
