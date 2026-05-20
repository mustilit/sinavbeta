// @ts-nocheck
import { Controller, Get, Req, Inject } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOkResponse, ApiForbiddenResponse } from '@nestjs/swagger';
import { Roles } from '../decorators/roles.decorator';
import { ListMyRefundsUseCase } from '../../application/use-cases/refund/ListMyRefundsUseCase';

/**
 * Giriş yapmış adayın iade taleplerini listeler.
 * Sadece CANDIDATE rolüne açıktır.
 */
@Controller('me')
@ApiTags('me')
export class MeRefundsController {
  constructor(@Inject(ListMyRefundsUseCase) private readonly listMyRefunds: ListMyRefundsUseCase) {}

  @Get('refunds')
  @Roles('CANDIDATE')
  @ApiBearerAuth('bearer')
  @ApiOkResponse({ description: 'List of current user refund requests' })
  @ApiForbiddenResponse({ description: 'Forbidden' })
  async getRefunds(@Req() req: any) {
    const actorId = (req as any).user?.id;
    return this.listMyRefunds.execute(actorId);
  }
}
