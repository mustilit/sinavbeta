// @ts-nocheck
import { Controller, Get, Post, Query, Body, HttpException, HttpStatus, Inject } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOkResponse, ApiForbiddenResponse } from '@nestjs/swagger';
import { Roles } from '../decorators/roles.decorator';
import { GetCandidateReportUseCase } from '../../application/use-cases/report/GetCandidateReportUseCase';
import { SendBulkCandidateEmailUseCase } from '../../application/use-cases/admin/SendBulkCandidateEmailUseCase';

/**
 * Admin aday yönetimi — aday raporunu listeler ve toplu e-posta gönderir.
 * Sadece ADMIN rolüne açıktır.
 */
@Controller('admin/candidates')
@ApiTags('admin/candidates')
export class AdminCandidatesController {
  constructor(
    @Inject(GetCandidateReportUseCase) private readonly getReport: GetCandidateReportUseCase,
    @Inject(SendBulkCandidateEmailUseCase) private readonly sendBulkEmail: SendBulkCandidateEmailUseCase,
  ) {}

  @Get('report')
  @Roles('ADMIN')
  @ApiBearerAuth('bearer')
  @ApiOkResponse({ description: 'Paginated candidate report with aggregated stats' })
  @ApiForbiddenResponse({ description: 'Forbidden' })
  async report(@Query() q: any) {
    return this.getReport.execute({
      q: q.q,
      status: q.status,
      registeredFrom: q.registeredFrom,
      registeredTo: q.registeredTo,
      lastLoginFrom: q.lastLoginFrom,
      lastLoginTo: q.lastLoginTo,
      minPurchases: q.minPurchases != null ? Number(q.minPurchases) : undefined,
      maxPurchases: q.maxPurchases != null ? Number(q.maxPurchases) : undefined,
      minSpentCents: q.minSpentCents != null ? Number(q.minSpentCents) : undefined,
      maxSpentCents: q.maxSpentCents != null ? Number(q.maxSpentCents) : undefined,
      minCorrectRate: q.minCorrectRate != null ? Number(q.minCorrectRate) : undefined,
      maxCorrectRate: q.maxCorrectRate != null ? Number(q.maxCorrectRate) : undefined,
      hasNeverLoggedIn: q.hasNeverLoggedIn === 'true',
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
  async bulkEmail(@Body() body: { candidateIds: string[]; subject: string; body: string }) {
    try {
      return await this.sendBulkEmail.execute({
        candidateIds: body.candidateIds,
        subject: body.subject,
        body: body.body,
      });
    } catch (err: any) {
      throw new HttpException({ error: err.message }, err.status ?? HttpStatus.BAD_REQUEST);
    }
  }
}
