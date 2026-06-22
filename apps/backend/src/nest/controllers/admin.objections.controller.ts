import { Controller, Get, Post, Body, Param, Query, Inject, Req } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOkResponse, ApiForbiddenResponse } from '@nestjs/swagger';
import { Roles } from '../decorators/roles.decorator';
import { ListObjectionsQueryDto } from './dto/list-objections-query.dto';
import { ListEscalatedObjectionsUseCase } from '../../application/use-cases/objection/ListEscalatedObjectionsUseCase';
import { ListAllObjectionsUseCase } from '../../application/use-cases/objection/ListAllObjectionsUseCase';
import { ListTestReportStatsUseCase } from '../../application/use-cases/report/ListTestReportStatsUseCase';
import { AnswerObjectionByAdminUseCase } from '../../application/use-cases/objection/AnswerObjectionByAdminUseCase';
import { ListAllContentReportsUseCase, NoteContentReportUseCase } from '../../application/use-cases/objection/ContentReportUseCases';
import { IsString, MinLength } from 'class-validator';

class AdminAnswerObjectionDto {
  @IsString()
  @MinLength(5, { message: 'En az 5 karakter olmalı' })
  adminAnswerText!: string;
}

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
    @Inject(AnswerObjectionByAdminUseCase) private readonly adminAnswerUC: AnswerObjectionByAdminUseCase,
    @Inject(ListAllContentReportsUseCase) private readonly listAllContentReports: ListAllContentReportsUseCase,
    @Inject(NoteContentReportUseCase) private readonly noteContentReport: NoteContentReportUseCase,
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
    // Test itirazları + tünel/yazılı hata bildirimleri birleşik (tarihe göre).
    const [objections, contentReports] = await Promise.all([
      this.listAll.execute({
        status: status || undefined,
        from: from ? new Date(from) : undefined,
        to: to ? new Date(to) : undefined,
      }),
      this.listAllContentReports.execute({ status: status || undefined }),
    ]);
    return [...objections, ...contentReports].sort(
      (a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }

  @Get('test-stats')
  @Roles('ADMIN')
  @ApiBearerAuth('bearer')
  @ApiOkResponse({ description: 'Test-level report count stats, sorted by total desc' })
  @ApiForbiddenResponse({ description: 'Forbidden' })
  async testStats() {
    return this.listStats.execute();
  }

  @Post(':id/admin-answer')
  @Roles('ADMIN')
  @ApiBearerAuth('bearer')
  @ApiOkResponse({ description: 'Admin answer saved (independent of educator answer)' })
  @ApiForbiddenResponse({ description: 'Forbidden' })
  async adminAnswer(
    @Param('id') objectionId: string,
    @Body() body: AdminAnswerObjectionDto,
    @Req() req: any,
  ) {
    const actorId = (req as any).user?.id;
    return this.adminAnswerUC.execute(
      { objectionId, adminAnswerText: body.adminAnswerText },
      actorId,
    );
  }

  /** Tünel/yazılı hata bildirimine admin notu (eğitici izahından bağımsız). */
  @Post('content/:kind/:id/note')
  @Roles('ADMIN')
  @ApiBearerAuth('bearer')
  @ApiOkResponse({ description: 'Admin note saved on content report' })
  @ApiForbiddenResponse({ description: 'Forbidden' })
  async noteContent(
    @Param('kind') kind: string,
    @Param('id') id: string,
    @Body() body: AdminAnswerObjectionDto,
    @Req() req: any,
  ) {
    const actorId = (req as any).user?.id;
    const k = kind === 'tunnel' ? 'tunnel' : 'written';
    return this.noteContentReport.execute({ kind: k, id, adminNote: body.adminAnswerText }, actorId);
  }
}
