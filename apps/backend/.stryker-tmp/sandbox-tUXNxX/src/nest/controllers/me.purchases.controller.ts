// @ts-nocheck
import { Controller, Get, Req, Inject } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOkResponse, ApiForbiddenResponse } from '@nestjs/swagger';
import { Roles } from '../decorators/roles.decorator';
import { ListMyPurchasesUseCase } from '../../application/use-cases/purchase/ListMyPurchasesUseCase';

/**
 * Giriş yapmış adayın satın alma geçmişini ve ilgili deneme bilgilerini döndürür.
 * CANDIDATE ve ADMIN rollerine açıktır.
 */
@Controller('me')
@ApiTags('me')
export class MePurchasesController {
  constructor(@Inject(ListMyPurchasesUseCase) private readonly listMyPurchases: ListMyPurchasesUseCase) {}

  @Get('purchases')
  @Roles('CANDIDATE', 'ADMIN')
  @ApiBearerAuth('bearer')
  @ApiOkResponse({ description: 'List of current user purchases with attempts' })
  @ApiForbiddenResponse({ description: 'Forbidden' })
  async getPurchases(@Req() req: any) {
    const candidateId = (req as any).user?.id;
    return this.listMyPurchases.execute(candidateId);
  }
}
