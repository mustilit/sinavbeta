// @ts-nocheck
import { Controller, Post, Get, Put, Body, Param, Inject } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOkResponse, ApiCreatedResponse, ApiNotFoundResponse, ApiBadRequestResponse, ApiConflictResponse } from '@nestjs/swagger';
import { Roles } from '../decorators/roles.decorator';
import { CreateWorkerUseCase } from '../../application/use-cases/admin/CreateWorkerUseCase';
import { GetWorkerPermissionsUseCase } from '../../application/use-cases/admin/GetWorkerPermissionsUseCase';
import { UpdateWorkerPermissionsUseCase } from '../../application/use-cases/admin/UpdateWorkerPermissionsUseCase';
import { CreateWorkerDto } from './dto/create-worker.dto';
import { UpdateWorkerPermissionsDto } from './dto/update-worker-permissions.dto';

/**
 * Admin tarafından worker kullanıcı oluşturma ve izin yönetimi.
 * Tüm endpoint'ler yalnızca ADMIN rolüne açıktır.
 */
@Controller('admin/workers')
@ApiTags('admin/workers')
export class AdminWorkersController {
  constructor(
    @Inject(CreateWorkerUseCase) private readonly createWorkerUC: CreateWorkerUseCase,
    @Inject(GetWorkerPermissionsUseCase) private readonly getPermissionsUC: GetWorkerPermissionsUseCase,
    @Inject(UpdateWorkerPermissionsUseCase) private readonly updatePermissionsUC: UpdateWorkerPermissionsUseCase,
  ) {}

  /** Yeni worker kullanıcısı oluşturur; başlangıç sayfa izinleri isteğe bağlıdır */
  @Post()
  @Roles('ADMIN')
  @ApiBearerAuth('bearer')
  @ApiCreatedResponse({ description: 'Worker oluşturuldu' })
  @ApiConflictResponse({ description: 'E-posta veya kullanıcı adı zaten kullanımda' })
  async create(@Body() dto: CreateWorkerDto) {
    return this.createWorkerUC.execute({
      email: dto.email,
      username: dto.username,
      password: dto.password,
      pages: dto.pages ?? [],
    });
  }

  /** Belirtilen worker kullanıcısının sayfa izinlerini döndürür */
  @Get(':userId/permissions')
  @Roles('ADMIN')
  @ApiBearerAuth('bearer')
  @ApiOkResponse({ description: 'Worker izinleri' })
  @ApiNotFoundResponse({ description: 'Kullanıcı bulunamadı' })
  @ApiBadRequestResponse({ description: 'Kullanıcı worker değil' })
  async getPermissions(@Param('userId') userId: string) {
    return this.getPermissionsUC.execute(userId);
  }

  /** Worker kullanıcısının sayfa izinlerini günceller (tam liste ile değiştirir) */
  @Put(':userId/permissions')
  @Roles('ADMIN')
  @ApiBearerAuth('bearer')
  @ApiOkResponse({ description: 'Worker izinleri güncellendi' })
  @ApiNotFoundResponse({ description: 'Kullanıcı bulunamadı' })
  @ApiBadRequestResponse({ description: 'Kullanıcı worker değil' })
  async updatePermissions(
    @Param('userId') userId: string,
    @Body() dto: UpdateWorkerPermissionsDto,
  ) {
    return this.updatePermissionsUC.execute(userId, dto.pages);
  }
}
