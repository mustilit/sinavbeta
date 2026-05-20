// @ts-nocheck
import { Controller, Get, Query, Inject } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOkResponse, ApiForbiddenResponse } from '@nestjs/swagger';
import { Roles } from '../decorators/roles.decorator';
import { ListAuditLogsUseCase } from '../../application/use-cases/admin/ListAuditLogsUseCase';
import { ListAuditLogsQueryDto } from './dto/list-audit-logs-query.dto';

/**
 * Admin denetim logu görüntüleme — eylem, varlık tipi, aktör ve tarih aralığına
 * göre filtrelenebilir audit log listesi döndürür. Sadece ADMIN rolüne açıktır.
 */
@Controller('admin/audit')
@ApiTags('admin/audit')
export class AdminAuditController {
  constructor(@Inject(ListAuditLogsUseCase) private readonly listAudit: ListAuditLogsUseCase) {}

  @Get()
  @Roles('ADMIN')
  @ApiBearerAuth('bearer')
  @ApiOkResponse({ description: 'Audit logs with filters' })
  @ApiForbiddenResponse({ description: 'Forbidden' })
  async list(@Query() query: ListAuditLogsQueryDto) {
    const { action, entityType, entityId, actorId, from, to, page, limit } = query;
    return this.listAudit.execute({ action, entityType, entityId, actorId, from, to, page, limit });
  }
}
