// @ts-nocheck
import { Controller, Get, Post, Patch, Delete, Body, Query, Param, Inject } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOkResponse, ApiCreatedResponse } from '@nestjs/swagger';
import { Roles } from '../decorators/roles.decorator';
import { CreateAdPackageDto } from './dto/create-ad-package.dto';
import { UpdateAdPackageDto } from './dto/update-ad-package.dto';
import { CreateAdPackageUseCase } from '../../application/use-cases/ad/CreateAdPackageUseCase';
import { ListAdPackagesUseCase } from '../../application/use-cases/ad/ListAdPackagesUseCase';
import { UpdateAdPackageUseCase } from '../../application/use-cases/ad/UpdateAdPackageUseCase';
import { DeleteAdPackageUseCase } from '../../application/use-cases/ad/DeleteAdPackageUseCase';

/** FR-Y-09: Reklam paketleri tanımlama */
@Controller('admin/ad-packages')
@ApiTags('admin/ad-packages')
export class AdminAdPackagesController {
  constructor(
    @Inject(ListAdPackagesUseCase) private readonly listUC: ListAdPackagesUseCase,
    @Inject(CreateAdPackageUseCase) private readonly createUC: CreateAdPackageUseCase,
    @Inject(UpdateAdPackageUseCase) private readonly updateUC: UpdateAdPackageUseCase,
    @Inject(DeleteAdPackageUseCase) private readonly deleteUC: DeleteAdPackageUseCase,
  ) {}

  @Get()
  @Roles('ADMIN')
  @ApiBearerAuth('bearer')
  @ApiOkResponse({ description: 'List ad packages' })
  async list(@Query('activeOnly') activeOnly?: string) {
    const only = activeOnly === 'false' ? false : true;
    return this.listUC.execute(only);
  }

  @Post()
  @Roles('ADMIN')
  @ApiBearerAuth('bearer')
  @ApiCreatedResponse({ description: 'Created' })
  async create(@Body() body: CreateAdPackageDto) {
    return this.createUC.execute({
      name: body.name,
      durationDays: body.durationDays,
      impressions: body.impressions,
      priceCents: body.priceCents,
      currency: body.currency,
      active: body.active,
    });
  }

  @Patch(':id')
  @Roles('ADMIN')
  @ApiBearerAuth('bearer')
  @ApiOkResponse({ description: 'Updated' })
  async update(@Param('id') id: string, @Body() body: UpdateAdPackageDto) {
    return this.updateUC.execute(id, {
      name: body.name,
      durationDays: body.durationDays,
      impressions: body.impressions,
      priceCents: body.priceCents,
      currency: body.currency,
      active: body.active,
    });
  }

  @Delete(':id')
  @Roles('ADMIN')
  @ApiBearerAuth('bearer')
  @ApiOkResponse({ description: 'Deleted' })
  async delete(@Param('id') id: string) {
    return this.deleteUC.execute(id);
  }
}
