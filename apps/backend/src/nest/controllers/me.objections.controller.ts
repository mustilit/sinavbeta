import { Controller, Get, Query, Req, Inject } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOkResponse, ApiForbiddenResponse } from '@nestjs/swagger';
import { Roles } from '../decorators/roles.decorator';
import { ListMyObjectionsUseCase } from '../../application/use-cases/objection/ListMyObjectionsUseCase';
import { ListMyTunnelQuestionReportsUseCase } from '../../application/use-cases/tunnel/ListMyTunnelQuestionReportsUseCase';
import { ListMyWrittenQuestionReportsUseCase } from '../../application/use-cases/written/ListMyWrittenQuestionReportsUseCase';

/**
 * Giriş yapmış adayın kendi açtığı hata bildirimlerini listeler.
 * Sadece CANDIDATE rolüne açıktır. Aday yalnızca kendi bildirimlerini görebilir,
 * başka adayların bildirimlerine erişemez.
 *
 * Üç kaynak birleştirilir (createdAt azalan): normal test itirazları (Objection),
 * tünel soru hata bildirimleri (TunnelQuestionReport), yazılı test hata bildirimleri
 * (WrittenQuestionReport).
 */
@Controller('me')
@ApiTags('me')
export class MeObjectionsController {
  constructor(
    @Inject(ListMyObjectionsUseCase) private readonly listMyObjections: ListMyObjectionsUseCase,
    @Inject(ListMyTunnelQuestionReportsUseCase)
    private readonly listMyTunnelReports: ListMyTunnelQuestionReportsUseCase,
    @Inject(ListMyWrittenQuestionReportsUseCase)
    private readonly listMyWrittenReports: ListMyWrittenQuestionReportsUseCase,
  ) {}

  @Get('objections')
  @Roles('CANDIDATE')
  @ApiBearerAuth('bearer')
  @ApiOkResponse({ description: 'Aday itirazları + tünel + yazılı hata bildirimleri (read-only)' })
  @ApiForbiddenResponse({ description: 'Forbidden' })
  async getMyObjections(@Req() req: any, @Query('status') status?: string) {
    const actorId = (req as any).user?.id;
    const [objections, tunnelReports, writtenReports] = await Promise.all([
      this.listMyObjections.execute(actorId, { status }),
      this.listMyTunnelReports.execute(actorId, { status }),
      this.listMyWrittenReports.execute(actorId, { status }),
    ]);
    return [...objections, ...tunnelReports, ...writtenReports].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }
}
