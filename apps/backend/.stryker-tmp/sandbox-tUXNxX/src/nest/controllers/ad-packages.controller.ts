// @ts-nocheck
import { Controller, Get, Query, Inject } from '@nestjs/common';
import { ApiTags, ApiOkResponse } from '@nestjs/swagger';
import { Public } from '../decorators/public.decorator';
import { ListAdPackagesUseCase } from '../../application/use-cases/ad/ListAdPackagesUseCase';

/** Public: Eğiticilerin satın alabileceği aktif reklam paketlerini listeler */
@Controller('ad-packages')
@ApiTags('ad-packages')
export class AdPackagesController {
  constructor(@Inject(ListAdPackagesUseCase) private readonly listUC: ListAdPackagesUseCase) {}

  @Public()
  @Get()
  @ApiOkResponse({ description: 'List active ad packages (for educators)' })
  async list() {
    return this.listUC.execute(true);
  }
}
