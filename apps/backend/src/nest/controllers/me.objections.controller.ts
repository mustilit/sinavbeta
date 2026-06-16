import { Controller, Get, Query, Req, Inject } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOkResponse, ApiForbiddenResponse } from '@nestjs/swagger';
import { Roles } from '../decorators/roles.decorator';
import { ListMyObjectionsUseCase } from '../../application/use-cases/objection/ListMyObjectionsUseCase';
import { ListMyTunnelQuestionReportsUseCase } from '../../application/use-cases/tunnel/ListMyTunnelQuestionReportsUseCase';

/**
 * Giriş yapmış adayın kendi açtığı hata bildirimlerini listeler.
 * Sadece CANDIDATE rolüne açıktır. Aday yalnızca kendi bildirimlerini görebilir,
 * başka adayların bildirimlerine erişemez.
 *
 * Normal test hata bildirimleri (Objection) + tünel soru hata bildirimleri
 * (TunnelQuestionReport) birleştirilip tek listede, createdAt'e göre azalan sırada döner.
 */
@Controller('me')
@ApiTags('me')
export class MeObjectionsController {
  constructor(
    @Inject(ListMyObjectionsUseCase) private readonly listMyObjections: ListMyObjectionsUseCase,
    @Inject(ListMyTunnelQuestionReportsUseCase)
    private readonly listMyTunnelReports: ListMyTunnelQuestionReportsUseCase,
  ) {}

  @Get('objections')
  @Roles('CANDIDATE')
  @ApiBearerAuth('bearer')
  @ApiOkResponse({ description: 'List of current candidate objections + tunnel question reports (read-only)' })
  @ApiForbiddenResponse({ description: 'Forbidden' })
  async getMyObjections(@Req() req: any, @Query('status') status?: string) {
    const actorId = (req as any).user?.id;
    const [objections, tunnelReports] = await Promise.all([
      this.listMyObjections.execute(actorId, { status }),
      this.listMyTunnelReports.execute(actorId, { status }),
    ]);
    return [...objections, ...tunnelReports].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }
}
