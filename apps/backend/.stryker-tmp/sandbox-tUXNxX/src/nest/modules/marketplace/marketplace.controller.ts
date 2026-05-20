// @ts-nocheck
import { Controller, Get, Query, Param, Inject } from '@nestjs/common';
import { ApiTags, ApiOkResponse } from '@nestjs/swagger';
import { ApiErrorResponses } from '../../swagger/decorators';
import { ListMarketplaceTestsResponseDto } from './dto/marketplace-list.response.dto';
import { ListMarketplaceTestsUseCase } from '../../../application/use-cases/test/ListMarketplaceTestsUseCase';
import { ListMarketplacePackagesUseCase } from '../../../application/use-cases/package/ListMarketplacePackagesUseCase';
import { GetMarketplacePackageUseCase } from '../../../application/use-cases/package/GetMarketplacePackageUseCase';
import { Public } from '../../decorators/public.decorator';
import { ListMarketplaceTestsDto } from './dto/list-marketplace-tests.dto';

@Controller('marketplace')
@ApiTags('Marketplace')
export class MarketplaceController {
  constructor(
    @Inject(ListMarketplaceTestsUseCase) private readonly listUC: ListMarketplaceTestsUseCase,
    @Inject(ListMarketplacePackagesUseCase) private readonly listPackagesUC: ListMarketplacePackagesUseCase,
    @Inject(GetMarketplacePackageUseCase) private readonly getPackageUC: GetMarketplacePackageUseCase,
  ) {}

  @Public()
  @Get('tests')
  @ApiOkResponse({ type: ListMarketplaceTestsResponseDto })
  @ApiErrorResponses()
  async list(@Query() filters: ListMarketplaceTestsDto) {
    // ValidationPipe + transform will coerce query strings to proper types.
    return this.listUC.execute(filters);
  }

  @Public()
  @Get('packages')
  @ApiErrorResponses()
  async listPackages(
    @Query('examTypeId') examTypeId?: string,
    @Query('limit') limit?: string,
    @Query('q') q?: string,
  ) {
    return this.listPackagesUC.execute({
      examTypeId,
      limit: limit ? parseInt(limit, 10) : 20,
      q: q?.trim() || undefined,
    });
  }

  @Public()
  @Get('packages/:id')
  @ApiErrorResponses()
  async getPackage(@Param('id') id: string) {
    return this.getPackageUC.execute(id);
  }
}

