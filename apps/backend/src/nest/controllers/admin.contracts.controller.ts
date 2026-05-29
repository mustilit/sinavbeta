import { Controller, Get, Post, Patch, Param, Body, Query, HttpException, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOkResponse, ApiCreatedResponse, ApiForbiddenResponse, ApiNotFoundResponse, ApiConflictResponse } from '@nestjs/swagger';
import { Roles } from '../decorators/roles.decorator';
import { CreateContractUseCase } from '../../application/use-cases/contract/CreateContractUseCase';
import { UpdateContractUseCase } from '../../application/use-cases/contract/UpdateContractUseCase';
import { ListContractsUseCase } from '../../application/use-cases/contract/ListContractsUseCase';
import { GetActiveContractUseCase } from '../../application/use-cases/contract/GetActiveContractUseCase';
import { CONTRACT_REPO } from '../../application/constants';
import { Inject } from '@nestjs/common';
import type { IContractRepository } from '../../domain/interfaces/IContractRepository';

/**
 * Admin eğitici sözleşme yönetimi — sözleşmeleri listeler, oluşturur,
 * günceller ve aktif sürümü belirler.
 * Eğitici kaydında geçerli sözleşme varlığı kontrol edilir; sadece ADMIN rolüne açıktır.
 */
@Controller('admin/contracts')
@ApiTags('admin/contracts')
export class AdminContractsController {
  // NOT: Use case'ler @Inject ile EXPLICIT token alır. tsx/esbuild
  // `emitDecoratorMetadata` üretmediğinden, salt tip-bazlı injection
  // (parametre tipinden token çıkarımı) `undefined` enjekte eder ve
  // runtime'da "Cannot read properties of undefined" hatası verir.
  constructor(
    @Inject(CONTRACT_REPO) private readonly contractRepo: IContractRepository,
    @Inject(ListContractsUseCase) private readonly listContracts: ListContractsUseCase,
    @Inject(CreateContractUseCase) private readonly createContract: CreateContractUseCase,
    @Inject(UpdateContractUseCase) private readonly updateContract: UpdateContractUseCase,
  ) {}

  @Get()
  @Roles('ADMIN')
  @ApiBearerAuth('bearer')
  @ApiOkResponse({ description: 'List of contracts' })
  @ApiForbiddenResponse({ description: 'Forbidden' })
  async list(@Query('type') type?: string) {
    // 4 ContractType: CANDIDATE / EDUCATOR / PRIVACY / DISTANCE_SALE.
    // Geçersiz/boş type → filtresiz tüm sözleşmeler.
    const VALID = ['CANDIDATE', 'EDUCATOR', 'PRIVACY', 'DISTANCE_SALE'];
    const t = type && VALID.includes(type) ? (type as any) : undefined;
    return this.listContracts.execute(t);
  }

  @Post()
  @Roles('ADMIN')
  @ApiBearerAuth('bearer')
  @ApiCreatedResponse({ description: 'Created' })
  @ApiForbiddenResponse({ description: 'Forbidden' })
  @ApiConflictResponse({ description: 'Version exists' })
  async create(@Body() body: { type: string; version: number; title: string; content: string; isActive?: boolean }) {
    return this.createContract.execute(body);
  }

  @Patch(':id')
  @Roles('ADMIN')
  @ApiBearerAuth('bearer')
  @ApiOkResponse({ description: 'Updated' })
  @ApiForbiddenResponse({ description: 'Forbidden' })
  @ApiNotFoundResponse({ description: 'Not found' })
  async update(@Param('id') id: string, @Body() body: { title?: string; content?: string; isActive?: boolean }) {
    return this.updateContract.execute(id, body);
  }

  @Post(':id/set-active')
  @Roles('ADMIN')
  @ApiBearerAuth('bearer')
  @ApiOkResponse({ description: 'Contract set as active' })
  @ApiForbiddenResponse({ description: 'Forbidden' })
  @ApiNotFoundResponse({ description: 'Not found' })
  async setActive(@Param('id') id: string) {
    const contract = await this.contractRepo.getById(id);
    if (!contract) throw new HttpException({ error: 'Contract not found' }, HttpStatus.NOT_FOUND);
    return this.contractRepo.setActive(contract.type, id);
  }
}
