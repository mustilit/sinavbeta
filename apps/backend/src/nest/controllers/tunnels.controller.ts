import { Controller, Get, Post, Patch, Body, Param, Req, Inject } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOkResponse, ApiCreatedResponse } from '@nestjs/swagger';
import { Roles } from '../decorators/roles.decorator';
import { CreateTunnelDto } from './dto/create-tunnel.dto';
import { UpdateTunnelDto } from './dto/update-tunnel.dto';
import { SaveTunnelQuestionsDto } from './dto/save-tunnel-questions.dto';
import { CreateTunnelUseCase } from '../../application/use-cases/tunnel/CreateTunnelUseCase';
import { UpdateTunnelUseCase } from '../../application/use-cases/tunnel/UpdateTunnelUseCase';
import { SaveTunnelQuestionsUseCase } from '../../application/use-cases/tunnel/SaveTunnelQuestionsUseCase';
import { SubmitTunnelForApprovalUseCase } from '../../application/use-cases/tunnel/SubmitTunnelForApprovalUseCase';
import { GetTunnelUseCase } from '../../application/use-cases/tunnel/GetTunnelUseCase';
import { ListEducatorTunnelsUseCase } from '../../application/use-cases/tunnel/ListTunnelsUseCase';

/**
 * Eğitici tünel CRUD + onaya gönderme. Tümü EDUCATOR (admin da görüntüleyebilir
 * — GetTunnel rol kontrolü use-case'te). Sahiplik use-case katmanında zorlanır.
 */
@Controller('tunnels')
@ApiTags('Tunnels')
@ApiBearerAuth('bearer')
export class TunnelsController {
  constructor(
    @Inject(CreateTunnelUseCase) private readonly createUC: CreateTunnelUseCase,
    @Inject(UpdateTunnelUseCase) private readonly updateUC: UpdateTunnelUseCase,
    @Inject(SaveTunnelQuestionsUseCase) private readonly saveUC: SaveTunnelQuestionsUseCase,
    @Inject(SubmitTunnelForApprovalUseCase) private readonly submitUC: SubmitTunnelForApprovalUseCase,
    @Inject(GetTunnelUseCase) private readonly getUC: GetTunnelUseCase,
    @Inject(ListEducatorTunnelsUseCase) private readonly listUC: ListEducatorTunnelsUseCase,
  ) {}

  @Post()
  @Roles('EDUCATOR', 'ADMIN')
  @ApiCreatedResponse({ description: 'Tünel oluşturuldu (DRAFT)' })
  async create(@Body() dto: CreateTunnelDto, @Req() req: any) {
    return this.createUC.execute(
      {
        title: dto.title,
        description: dto.description,
        examTypeId: dto.examTypeId,
        topicId: dto.topicId,
        priceCents: dto.priceCents,
        coverImageUrl: dto.coverImageUrl,
      },
      req.user?.id,
    );
  }

  @Patch(':id')
  @Roles('EDUCATOR', 'ADMIN')
  @ApiOkResponse({ description: 'Tünel meta güncellendi (DRAFT/REJECTED)' })
  async update(@Param('id') id: string, @Body() dto: UpdateTunnelDto, @Req() req: any) {
    return this.updateUC.execute(
      id,
      {
        title: dto.title,
        description: dto.description,
        examTypeId: dto.examTypeId,
        topicId: dto.topicId,
        priceCents: dto.priceCents,
        coverImageUrl: dto.coverImageUrl,
      },
      req.user?.id,
    );
  }

  @Get('mine')
  @Roles('EDUCATOR', 'ADMIN')
  @ApiOkResponse({ description: 'Eğiticinin tünelleri' })
  async mine(@Req() req: any) {
    return this.listUC.execute(req.user?.id);
  }

  @Get(':id')
  @Roles('EDUCATOR', 'ADMIN', 'WORKER')
  @ApiOkResponse({ description: 'Tünel detayı (katman+soru+seçenek)' })
  async get(@Param('id') id: string, @Req() req: any) {
    return this.getUC.execute(id, req.user?.id, req.user?.role);
  }

  @Patch(':id/questions')
  @Roles('EDUCATOR', 'ADMIN')
  @ApiOkResponse({ description: 'Katman soruları kaydedildi' })
  async saveQuestions(@Param('id') id: string, @Body() dto: SaveTunnelQuestionsDto, @Req() req: any) {
    return this.saveUC.execute(id, dto.layers, req.user?.id);
  }

  @Post(':id/submit')
  @Roles('EDUCATOR', 'ADMIN')
  @ApiOkResponse({ description: 'Tünel onaya gönderildi' })
  async submit(@Param('id') id: string, @Req() req: any) {
    return this.submitUC.execute(id, req.user?.id);
  }
}
