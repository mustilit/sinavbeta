// @ts-nocheck
import { Controller, Get, Post, Query, Body, Req, HttpCode, Inject } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOkResponse, ApiNotFoundResponse, ApiConflictResponse, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { Public } from '../../decorators/public.decorator';
import { Roles } from '../../decorators/roles.decorator';
import { GetActiveContractUseCase } from '../../../application/use-cases/contract/GetActiveContractUseCase';
import { AcceptContractUseCase } from '../../../application/use-cases/contract/AcceptContractUseCase';
import { GetActiveContractQueryDto } from './dto/get-active-contract.query.dto';
import { AcceptContractDto } from './dto/accept-contract.dto';

@Controller('contracts')
@ApiTags('contracts')
export class ContractsController {
  constructor(
    @Inject(GetActiveContractUseCase) private readonly getActiveContract: GetActiveContractUseCase,
    @Inject(AcceptContractUseCase) private readonly acceptContract: AcceptContractUseCase,
  ) {}

  @Get('active')
  @Public()
  @ApiOkResponse({ description: 'Active contract for the given type' })
  @ApiNotFoundResponse({ description: 'CONTRACT_NOT_FOUND' })
  async getActive(@Query() query: GetActiveContractQueryDto) {
    return this.getActiveContract.execute({ type: query.type });
  }

  @Post('accept')
  @HttpCode(200)
  @Roles('CANDIDATE', 'EDUCATOR', 'ADMIN')
  @ApiBearerAuth('bearer')
  @ApiOkResponse({ description: 'Contract accepted (or already accepted)' })
  @ApiNotFoundResponse({ description: 'CONTRACT_NOT_FOUND' })
  @ApiConflictResponse({ description: 'CONTRACT_NOT_ACTIVE' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async accept(@Body() body: AcceptContractDto, @Req() req: any) {
    const userId = (req as any).user?.sub;
    const ip = (req as any).ip;
    const userAgent = (req as any).headers?.['user-agent'] as string | undefined;
    return this.acceptContract.execute({
      userId,
      contractId: body.contractId,
      ip,
      userAgent,
    });
  }
}
