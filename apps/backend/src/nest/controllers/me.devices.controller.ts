import { Controller, Get, Delete, Param, Req, HttpCode } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOkResponse } from '@nestjs/swagger';
import { Roles } from '../decorators/roles.decorator';
import { ApiErrorResponses } from '../swagger/decorators';
import { ListUserDevicesUseCase } from '../../application/use-cases/auth/ListUserDevicesUseCase';
import { RevokeUserDeviceUseCase } from '../../application/use-cases/auth/RevokeUserDeviceUseCase';

/**
 * Profil > Güvenlik: kullanıcının onayladığı cihazları listeler ve onayını kaldırır.
 * Tüm roller (CANDIDATE/EDUCATOR/ADMIN/WORKER) kendi cihazlarını yönetir.
 */
@Controller('me')
@ApiTags('me')
@ApiBearerAuth('bearer')
export class MeDevicesController {
  private readonly listUC = new ListUserDevicesUseCase();
  private readonly revokeUC = new RevokeUserDeviceUseCase();

  @Get('devices')
  @Roles('CANDIDATE', 'EDUCATOR', 'ADMIN', 'WORKER')
  @ApiOkResponse({ description: 'Onaylı cihaz listesi' })
  @ApiErrorResponses()
  async list(@Req() req: any) {
    return this.listUC.execute(req.user?.id);
  }

  @Delete('devices/:id')
  @Roles('CANDIDATE', 'EDUCATOR', 'ADMIN', 'WORKER')
  @HttpCode(200)
  @ApiOkResponse({ description: 'Cihaz onayı kaldırıldı' })
  @ApiErrorResponses()
  async revoke(@Param('id') id: string, @Req() req: any) {
    const xff = req?.headers?.['x-forwarded-for'];
    const ip = xff ? String(xff).split(',')[0].trim() : req?.ip ?? null;
    return this.revokeUC.execute(req.user?.id, id, {
      ip,
      userAgent: req?.headers?.['user-agent'] ?? null,
    });
  }
}
