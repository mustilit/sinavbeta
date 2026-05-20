// @ts-nocheck
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
  constructor(
    @Inject(CONTRACT_REPO) private readonly contractRepo: IContractRepository,
    private readonly listContracts: ListContractsUseCase,
    private readonly createContract: CreateContractUseCase,
    private readonly updateContract: UpdateContractUseCase,
  ) {}

  @Get()
  @Roles('ADMIN')
  @ApiBearerAuth('bearer')
  @ApiOkResponse({ description: 'List of contracts' })
  @ApiForbiddenResponse({ description: 'Forbidden' })
  async list(@Query('type') type?: string) {
    const t = type === 'CANDIDATE' || type === 'EDUCATOR' ? type : undefined;
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
