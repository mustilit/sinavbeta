// @ts-nocheck
import { Controller, Get } from '@nestjs/common';
import { Public } from '../decorators/public.decorator';

/**
 * Kök endpoint — servis adı ve durum bilgisini döndürür.
 * Reverse proxy sağlık kontrolü için herkese açıktır (@Public).
 */
@Controller()
export class RootController {
  @Public()
  @Get('/')
  root() {
    return { status: 'ok', service: 'dal' };
  }
}

