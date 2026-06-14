import { Controller, Get, Post, Body, Param, Req, Inject } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOkResponse } from '@nestjs/swagger';
import { Roles } from '../decorators/roles.decorator';
import { RejectTunnelDto } from './dto/reject-tunnel.dto';
import { ListPendingTunnelsUseCase } from '../../application/use-cases/tunnel/ListTunnelsUseCase';
import { GetTunnelUseCase } from '../../application/use-cases/tunnel/GetTunnelUseCase';
import { ApproveTunnelUseCase, RejectTunnelUseCase } from '../../application/use-cases/tunnel/ReviewTunnelUseCase';

/**
 * Admin tünel inceleme/onay. Onaysız tünel yayınlanamaz; onay = yayın.
 */
@Controller('admin/tunnels')
@ApiTags('AdminTunnels')
@ApiBearerAuth('bearer')
export class AdminTunnelsController {
  constructor(
    @Inject(ListPendingTunnelsUseCase) private readonly listPendingUC: ListPendingTunnelsUseCase,
    @Inject(GetTunnelUseCase) private readonly getUC: GetTunnelUseCase,
    @Inject(ApproveTunnelUseCase) private readonly approveUC: ApproveTunnelUseCase,
    @Inject(RejectTunnelUseCase) private readonly rejectUC: RejectTunnelUseCase,
  ) {}

  @Get('pending')
  @Roles('ADMIN', 'WORKER')
  @ApiOkResponse({ description: 'Onay bekleyen tüneller' })
  async pending() {
    return this.listPendingUC.execute();
  }

  @Get(':id')
  @Roles('ADMIN', 'WORKER')
  @ApiOkResponse({ description: 'İnceleme için tünel detayı' })
  async get(@Param('id') id: string, @Req() req: any) {
    return this.getUC.execute(id, req.user?.id, req.user?.role);
  }

  @Post(':id/approve')
  @Roles('ADMIN')
  @ApiOkResponse({ description: 'Tünel onaylandı + yayınlandı' })
  async approve(@Param('id') id: string, @Req() req: any) {
    return this.approveUC.execute(id, req.user?.id);
  }

  @Post(':id/reject')
  @Roles('ADMIN')
  @ApiOkResponse({ description: 'Tünel reddedildi' })
  async reject(@Param('id') id: string, @Body() dto: RejectTunnelDto, @Req() req: any) {
    return this.rejectUC.execute(id, dto.reason, req.user?.id);
  }
}
