import { Controller, Get, Post, Param, Body, Req, Query, Inject, HttpCode } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOkResponse, ApiForbiddenResponse, ApiNotFoundResponse, ApiConflictResponse, ApiBadRequestResponse } from '@nestjs/swagger';
import { Roles } from '../decorators/roles.decorator';
import { ParseUUIDPipe } from '../pipes/parse-uuid.pipe';
import { AnswerObjectionDto } from './dto/answer-objection.dto';
import { AnswerObjectionUseCase } from '../../application/use-cases/objection/AnswerObjectionUseCase';
import { ListEducatorObjectionsUseCase } from '../../application/use-cases/objection/ListEducatorObjectionsUseCase';
import { ListEducatorContentReportsUseCase } from '../../application/use-cases/objection/ListEducatorContentReportsUseCase';

/**
 * Eğiticiye gelen soru itirazlarını listeler ve yanıtlar.
 * Listeleme isteğe bağlı `status` filtresi destekler; yanıtlama SLA kontrolüne tabidir.
 */
@Controller('educators/me/objections')
@ApiTags('educators/me/objections')
export class EducatorObjectionsController {
  constructor(
    @Inject(AnswerObjectionUseCase) private readonly answerObjection: AnswerObjectionUseCase,
    @Inject(ListEducatorObjectionsUseCase) private readonly listObjections: ListEducatorObjectionsUseCase,
    @Inject(ListEducatorContentReportsUseCase) private readonly listContentReports: ListEducatorContentReportsUseCase,
  ) {}

  @Get()
  @Roles('EDUCATOR')
  @ApiBearerAuth('bearer')
  @ApiOkResponse({ description: 'List objections + tunnel/written question reports for educator content' })
  @ApiForbiddenResponse({ description: 'Forbidden' })
  async list(@Req() req: any, @Query('status') status?: string) {
    const educatorId = (req as any).user?.id;
    // Test itirazları (yanıtlanabilir) + tünel/yazılı hata bildirimleri (salt görüntü) birleşik liste.
    const [objections, contentReports] = await Promise.all([
      this.listObjections.execute(educatorId, status ? { status } : undefined),
      this.listContentReports.execute(educatorId),
    ]);
    return [...objections, ...contentReports].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }

  @Post(':id/answer')
  @HttpCode(200)
  @Roles('EDUCATOR')
  @ApiBearerAuth('bearer')
  @ApiOkResponse({ description: 'Objection answered' })
  @ApiBadRequestResponse({ description: 'Answer too short' })
  @ApiForbiddenResponse({ description: 'Not owner or educator not approved/suspended' })
  @ApiNotFoundResponse({ description: 'Objection not found' })
  @ApiConflictResponse({ description: 'OBJECTION_SLA_EXPIRED' })
  async answer(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: AnswerObjectionDto,
    @Req() req: any,
  ) {
    const actorId = (req as any).user?.id;
    return this.answerObjection.execute({ objectionId: id, answerText: body.answerText }, actorId);
  }
}
