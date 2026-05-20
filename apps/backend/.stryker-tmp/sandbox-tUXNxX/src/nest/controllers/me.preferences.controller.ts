// @ts-nocheck
import { Controller, Get, Patch, Body, Req } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOkResponse, ApiForbiddenResponse } from '@nestjs/swagger';
import { Roles } from '../decorators/roles.decorator';
import { GetUserPreferencesUseCase } from '../../application/use-cases/notification/GetUserPreferencesUseCase';
import { UpdateUserPreferencesUseCase } from '../../application/use-cases/notification/UpdateUserPreferencesUseCase';
import { PrismaUserPreferenceRepository } from '../../infrastructure/repositories/PrismaUserPreferenceRepository';

/**
 * Kullanıcının UI tercihlerini (onboarding durumu, tema vb.) okur ve günceller.
 * Tüm roller erişebilir; güncelleme için WHITELIST kontrolü use-case katmanında yapılır.
 */
@Controller('me')
@ApiTags('me')
export class MePreferencesController {
  @Get('preferences')
  @Roles('CANDIDATE', 'EDUCATOR', 'ADMIN')
  @ApiBearerAuth('bearer')
  @ApiOkResponse({ description: 'User UI preferences' })
  @ApiForbiddenResponse({ description: 'Forbidden' })
  async get(@Req() req: any) {
    const userId = (req as any).user?.id ?? (req as any).user?.sub;
    const repo = new PrismaUserPreferenceRepository();
    const uc = new GetUserPreferencesUseCase(repo);
    return uc.execute(userId);
  }

  @Patch('preferences')
  @Roles('CANDIDATE', 'EDUCATOR', 'ADMIN')
  @ApiBearerAuth('bearer')
  @ApiOkResponse({ description: 'Preferences updated' })
  @ApiForbiddenResponse({ description: 'Forbidden' })
  async update(@Req() req: any, @Body() body: Record<string, unknown>) {
    const userId = (req as any).user?.id ?? (req as any).user?.sub;
    const repo = new PrismaUserPreferenceRepository();
    const uc = new UpdateUserPreferencesUseCase(repo);
    return uc.execute(userId, body);
  }
}
