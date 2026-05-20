// @ts-nocheck
import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOkResponse } from '@nestjs/swagger';
import { Roles } from '../decorators/roles.decorator';

/**
 * Bağlantı sağlık kontrolü endpoint'i.
 * Frontend'in heartbeat sistemi bu endpoint'i periyodik olarak çağırarak
 * sunucuya gerçekten erişilip erişilemediğini doğrular.
 * navigator.onLine'ın yanlış "online" bildirdiği (captive portal vb.) durumları yakalar.
 */
@Controller('me')
@ApiTags('me')
@ApiBearerAuth('bearer')
export class MeHeartbeatController {
  /**
   * Sunucu erişilebilirlik testi — { ok: true, ts: epoch_ms } döner.
   * Yalnızca kimlik doğrulaması gerekir; ek iş mantığı yoktur.
   */
  @Get('ping')
  @Roles('CANDIDATE', 'ADMIN', 'EDUCATOR')
  @ApiOkResponse({ description: 'Sunucu erişilebilir' })
  ping() {
    // Sunucu çalışıyor ve token geçerli
    return { ok: true, ts: Date.now() };
  }
}
