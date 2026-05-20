// @ts-nocheck
import { Controller, Get, Post, Query, Body, HttpException, HttpStatus, Inject } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOkResponse, ApiForbiddenResponse } from '@nestjs/swagger';
import { Roles } from '../decorators/roles.decorator';
import { GetEducatorReportUseCase } from '../../application/use-cases/report/GetEducatorReportUseCase';
import { SendBulkEducatorEmailUseCase } from '../../application/use-cases/admin/SendBulkEducatorEmailUseCase';

/**
 * Admin eğitici raporu ve toplu e-posta — eğitici performansını listeler
 * ve seçili eğiticilere toplu e-posta gönderir. Sadece ADMIN rolüne açıktır.
 */
@Controller('admin/educator-report')
@ApiTags('admin/educator-report')
export class AdminEducatorReportController {
  constructor(
    @Inject(GetEducatorReportUseCase) private readonly getReport: GetEducatorReportUseCase,
    @Inject(SendBulkEducatorEmailUseCase) private readonly sendBulkEmail: SendBulkEducatorEmailUseCase,
  ) {}

  @Get()
  @Roles('ADMIN')
  @ApiBearerAuth('bearer')
  @ApiOkResponse({ description: 'Paginated educator report with aggregated stats' })
  @ApiForbiddenResponse({ description: 'Forbidden' })
  async report(@Query() q: any) {
    return this.getReport.execute({
      q: q.q,
      status: q.status,
      lastLoginFrom: q.lastLoginFrom,
      lastLoginTo: q.lastLoginTo,
      approvedFrom: q.approvedFrom,
      approvedTo: q.approvedTo,
      examTypeId: q.examTypeId,
      minTests: q.minTests != null ? Number(q.minTests) : undefined,
      maxTests: q.maxTests != null ? Number(q.maxTests) : undefined,
      minSales: q.minSales != null ? Number(q.minSales) : undefined,
      maxSales: q.maxSales != null ? Number(q.maxSales) : undefined,
      minRating: q.minRating != null ? Number(q.minRating) : undefined,
      maxRating: q.maxRating != null ? Number(q.maxRating) : undefined,
      hasOpenObjections: q.hasOpenObjections === 'true',
      page: q.page != null ? Number(q.page) : undefined,
      limit: q.limit != null ? Number(q.limit) : undefined,
      sortBy: q.sortBy,
      order: q.order,
    });
  }

  @Post('bulk-email')
  @Roles('ADMIN')
  @ApiBearerAuth('bearer')
  @ApiOkResponse({ description: 'Bulk email result: sent and failed counts' })
  @ApiForbiddenResponse({ description: 'Forbidden' })
  async bulkEmail(@Body() body: { educatorIds: string[]; subject: string; body: string }) {
    try {
      return await this.sendBulkEmail.execute({
        educatorIds: body.educatorIds,
        subject: body.subject,
        body: body.body,
      });
    } catch (err: any) {
      throw new HttpException({ error: err.message }, err.status ?? HttpStatus.BAD_REQUEST);
    }
  }
}
