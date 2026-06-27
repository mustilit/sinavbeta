import { Controller, Post, Get, Patch, Put, Delete, Param, Body, Req, Inject, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOkResponse, ApiBearerAuth } from '@nestjs/swagger';
import { ApiErrorResponses } from '../swagger/decorators';
import { Roles } from '../decorators/roles.decorator';
import { EducatorActiveGuard } from '../guards/educator-active.guard';
import { CreatePackageDto } from './dto/create-package.dto';
import { UpdatePackageDto } from './dto/update-package.dto';
import { AddTestToPackageDto } from './dto/add-test-to-package.dto';
import { CreateTestPackageUseCase } from '../../application/use-cases/package/CreateTestPackageUseCase';
import { GetTestPackageUseCase } from '../../application/use-cases/package/GetTestPackageUseCase';
import { ListEducatorPackagesUseCase } from '../../application/use-cases/package/ListEducatorPackagesUseCase';
import { UpdateTestPackageUseCase } from '../../application/use-cases/package/UpdateTestPackageUseCase';
import { AddTestToPackageUseCase } from '../../application/use-cases/package/AddTestToPackageUseCase';
import { RemoveTestFromPackageUseCase } from '../../application/use-cases/package/RemoveTestFromPackageUseCase';
import { PublishTestPackageUseCase } from '../../application/use-cases/package/PublishTestPackageUseCase';
import { UnpublishTestPackageUseCase } from '../../application/use-cases/package/UnpublishTestPackageUseCase';

/**
 * TestPackage CRUD endpoint'leri.
 * Tüm endpoint'ler EDUCATOR rolüne kısıtlıdır.
 * Owner kontrolü Use Case katmanında yapılır.
 */
@Controller('packages')
@ApiTags('Packages')
@ApiBearerAuth('bearer')
@UseGuards(EducatorActiveGuard)
export class PackagesController {
  constructor(
    @Inject(CreateTestPackageUseCase) private readonly createUC: CreateTestPackageUseCase,
    @Inject(GetTestPackageUseCase) private readonly getUC: GetTestPackageUseCase,
    @Inject(ListEducatorPackagesUseCase) private readonly listUC: ListEducatorPackagesUseCase,
    @Inject(UpdateTestPackageUseCase) private readonly updateUC: UpdateTestPackageUseCase,
    @Inject(AddTestToPackageUseCase) private readonly addTestUC: AddTestToPackageUseCase,
    @Inject(RemoveTestFromPackageUseCase) private readonly removeTestUC: RemoveTestFromPackageUseCase,
    @Inject(PublishTestPackageUseCase) private readonly publishUC: PublishTestPackageUseCase,
    @Inject(UnpublishTestPackageUseCase) private readonly unpublishUC: UnpublishTestPackageUseCase,
  ) {}

  /** Educator'ın kendi paketlerini listele */
  @Get()
  @Roles('EDUCATOR', 'ADMIN')
  @ApiOkResponse({ description: 'Educator paket listesi' })
  @ApiErrorResponses()
  async list(@Req() req: any) {
    const educatorId = (req as any).user?.id;
    return this.listUC.execute(educatorId);
  }

  /** TestPackage oluştur */
  @Post()
  @Roles('EDUCATOR', 'ADMIN')
  @ApiOkResponse({ description: 'Paket oluşturuldu' })
  @ApiErrorResponses()
  async create(@Req() req: any, @Body() dto: CreatePackageDto) {
    const educatorId = (req as any).user?.id;
    return this.createUC.execute(educatorId, {
      title: dto.title,
      description: dto.description ?? null,
      priceCents: dto.priceCents,
      difficulty: dto.difficulty,
      language: dto.language,
      coverImageUrl: dto.coverImageUrl ?? null,
    });
  }

  /** TestPackage'ı testleriyle birlikte getir */
  @Get(':id')
  @Roles('EDUCATOR', 'ADMIN')
  @ApiOkResponse({ description: 'Paket detayı' })
  @ApiErrorResponses()
  async findOne(@Req() req: any, @Param('id') id: string) {
    const educatorId = (req as any).user?.id;
    return this.getUC.execute(id, educatorId);
  }

  /** Paket güncelle (title, description, priceCents) */
  @Patch(':id')
  @Roles('EDUCATOR', 'ADMIN')
  @ApiOkResponse({ description: 'Paket güncellendi' })
  @ApiErrorResponses()
  async update(@Req() req: any, @Param('id') id: string, @Body() dto: UpdatePackageDto) {
    const educatorId = (req as any).user?.id;
    return this.updateUC.execute(id, educatorId, {
      title: dto.title,
      description: dto.description,
      priceCents: dto.priceCents,
      language: dto.language,
      coverImageUrl: dto.coverImageUrl,
    });
  }

  /** Mevcut testi pakete ekle */
  @Post(':id/tests')
  @Roles('EDUCATOR', 'ADMIN')
  @ApiOkResponse({ description: 'Test pakete eklendi' })
  @ApiErrorResponses()
  async addTest(@Req() req: any, @Param('id') id: string, @Body() dto: AddTestToPackageDto) {
    const educatorId = (req as any).user?.id;
    return this.addTestUC.execute(id, educatorId, dto.testId);
  }

  /** Paketten test kaldır */
  @Delete(':id/tests/:testId')
  @Roles('EDUCATOR', 'ADMIN')
  @ApiOkResponse({ description: 'Test paketten kaldırıldı' })
  @ApiErrorResponses()
  async removeTest(@Req() req: any, @Param('id') id: string, @Param('testId') testId: string) {
    const educatorId = (req as any).user?.id;
    return this.removeTestUC.execute(id, educatorId, testId);
  }

  /** Paketi yayınla */
  @Put(':id/publish')
  @Roles('EDUCATOR', 'ADMIN')
  @ApiOkResponse({ description: 'Paket yayınlandı' })
  @ApiErrorResponses()
  async publish(@Req() req: any, @Param('id') id: string) {
    const educatorId = (req as any).user?.id;
    return this.publishUC.execute(id, educatorId);
  }

  /** Paketi yayından kaldır */
  @Put(':id/unpublish')
  @Roles('EDUCATOR', 'ADMIN')
  @ApiOkResponse({ description: 'Paket yayından kaldırıldı' })
  @ApiErrorResponses()
  async unpublish(@Req() req: any, @Param('id') id: string) {
    const educatorId = (req as any).user?.id;
    return this.unpublishUC.execute(id, educatorId);
  }
}
