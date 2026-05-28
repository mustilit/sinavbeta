import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsInt, IsOptional, IsString, Max, Min, IsIn, IsISO8601 } from 'class-validator';
import { Roles } from '../decorators/roles.decorator';
import { CreatePlatformPromoCodeUseCase } from '../../application/use-cases/platform-promo/CreatePlatformPromoCodeUseCase';
import { ListPlatformPromoCodesUseCase } from '../../application/use-cases/platform-promo/ListPlatformPromoCodesUseCase';
import { DeletePlatformPromoCodeUseCase } from '../../application/use-cases/platform-promo/DeletePlatformPromoCodeUseCase';
import { TogglePlatformPromoCodeUseCase } from '../../application/use-cases/platform-promo/TogglePlatformPromoCodeUseCase';

/**
 * Sprint 15 #3 — Admin platform promo kodu yönetimi.
 *
 * Sadece ADMIN/WORKER (yetkili) erişebilir. Endpoint'ler:
 *   POST   /admin/platform-promo-codes        — yeni kod oluştur
 *   GET    /admin/platform-promo-codes        — listele (cursor pagination)
 *   PATCH  /admin/platform-promo-codes/:id/toggle — aktif/pasif
 *   DELETE /admin/platform-promo-codes/:id    — sil (dikkat: usage kayıpları)
 */

const SCOPES = ['LIVE_SESSION', 'AD_PACKAGE'] as const;
type Scope = (typeof SCOPES)[number];

export class CreatePlatformPromoCodeDto {
  @IsString()
  code!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsInt()
  @Min(1)
  @Max(100)
  percentOff!: number;

  @IsArray()
  @IsIn([...SCOPES], { each: true })
  scopes!: Scope[];

  @IsOptional()
  @IsInt()
  @Min(1)
  maxUses?: number;

  @IsOptional()
  @IsISO8601()
  validFrom?: string;

  @IsOptional()
  @IsISO8601()
  validUntil?: string;
}

export class TogglePromoCodeDto {
  @IsBoolean()
  isActive!: boolean;
}

@ApiTags('Admin · Platform Promo Codes')
@Controller('admin/platform-promo-codes')
export class AdminPlatformPromoController {
  constructor(
    @Inject(CreatePlatformPromoCodeUseCase) private readonly createUC: CreatePlatformPromoCodeUseCase,
    @Inject(ListPlatformPromoCodesUseCase) private readonly listUC: ListPlatformPromoCodesUseCase,
    @Inject(DeletePlatformPromoCodeUseCase) private readonly deleteUC: DeletePlatformPromoCodeUseCase,
    @Inject(TogglePlatformPromoCodeUseCase) private readonly toggleUC: TogglePlatformPromoCodeUseCase,
  ) {}

  @Post()
  @Roles('ADMIN')
  @ApiBearerAuth('bearer')
  async create(@Req() req: any, @Body() dto: CreatePlatformPromoCodeDto) {
    const adminId = (req as any).user?.id;
    return this.createUC.execute(adminId, {
      code: dto.code,
      description: dto.description ?? null,
      percentOff: dto.percentOff,
      scopes: dto.scopes,
      maxUses: dto.maxUses ?? null,
      validFrom: dto.validFrom ? new Date(dto.validFrom) : null,
      validUntil: dto.validUntil ? new Date(dto.validUntil) : null,
    });
  }

  @Get()
  @Roles('ADMIN')
  @ApiBearerAuth('bearer')
  async list(
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
    @Query('scope') scope?: Scope,
    @Query('onlyActive') onlyActive?: string,
  ) {
    return this.listUC.execute({
      cursor,
      limit: limit ? Number(limit) : undefined,
      scope,
      onlyActive: onlyActive === 'true',
    });
  }

  @Patch(':id/toggle')
  @Roles('ADMIN')
  @ApiBearerAuth('bearer')
  async toggle(@Param('id') id: string, @Body() dto: TogglePromoCodeDto, @Req() req: any) {
    const adminId = (req as any).user?.id;
    return this.toggleUC.execute(id, dto.isActive, adminId);
  }

  @Delete(':id')
  @Roles('ADMIN')
  @ApiBearerAuth('bearer')
  async delete(@Param('id') id: string, @Req() req: any) {
    const adminId = (req as any).user?.id;
    return this.deleteUC.execute(id, adminId);
  }
}
