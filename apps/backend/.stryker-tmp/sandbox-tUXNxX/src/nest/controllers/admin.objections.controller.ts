// @ts-nocheck
import { Controller, Get, Query, Inject } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOkResponse, ApiForbiddenResponse } from '@nestjs/swagger';
import { Roles } from '../decorators/roles.decorator';
import { ListObjectionsQueryDto } from './dto/list-objections-query.dto';
import { ListEscalatedObjectionsUseCase } from '../../application/use-cases/objection/ListEscalatedObjectionsUseCase';
import { ListAllObjectionsUseCase } from '../../application/use-cases/objection/ListAllObjectionsUseCase';
import { ListTestReportStatsUseCase } from '../../application/use-cases/report/ListTestReportStatsUseCase';

/**
 * Admin itiraz yönetimi — tüm itirazları, yalnızca eskalatlanmışları listeler
 * ve soru başarısızlık istatistiklerini raporlar.
 * Sadece ADMIN rolüne açıktır.
 */
@Controller('admin/objections')
@ApiTags('admin/objections')
export class AdminObjectionsController {
  constructor(
    @Inject(ListEscalatedObjectionsUseCase) private readonly listEscalated: ListEscalatedObjectionsUseCase,
    @Inject(ListAllObjectionsUseCase) private readonly listAll: ListAllObjectionsUseCase,
    @Inject(ListTestReportStatsUseCase) private readonly listStats: ListTestReportStatsUseCase,
  ) {}

  @Get()
  @Roles('ADMIN')
  @ApiBearerAuth('bearer')
  @ApiOkResponse({ description: 'List escalated objections' })
  @ApiForbiddenResponse({ description: 'Forbidden' })
  async listEscalatedEndpoint(@Query() q: ListObjectionsQueryDto) {
    const filters: { from?: Date; to?: Date } = {};
    if (q.from) filters.from = new Date(q.from);
    if (q.to) filters.to = new Date(q.to);
    return this.listEscalated.execute(filters);
  }

  @Get('all')
  @Roles('ADMIN')
  @ApiBearerAuth('bearer')
  @ApiOkResponse({ description: 'List all objections (all statuses, enriched)' })
  @ApiForbiddenResponse({ description: 'Forbidden' })
  async listAllEndpoint(
    @Query('status') status?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.listAll.execute({
      status: status || undefined,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
    });
  }

  @Get('test-stats')
  @Roles('ADMIN')
  @ApiBearerAuth('bearer')
  @ApiOkResponse({ description: 'Test-level report count stats, sorted by total desc' })
  @ApiForbiddenResponse({ description: 'Forbidden' })
  async testStats() {
    return this.listStats.execute();
  }
}
