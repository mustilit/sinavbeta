// @ts-nocheck
import { Controller, Get, Post, Param, Body, Req, HttpCode, Inject } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOkResponse, ApiForbiddenResponse, ApiNotFoundResponse, ApiConflictResponse } from '@nestjs/swagger';
import { Roles } from '../decorators/roles.decorator';
import { ParseUUIDPipe } from '../pipes/parse-uuid.pipe';
import { ListEducatorRefundsUseCase } from '../../application/use-cases/refund/ListEducatorRefundsUseCase';
import { EducatorApproveRefundUseCase } from '../../application/use-cases/refund/EducatorApproveRefundUseCase';
import { EducatorRejectRefundUseCase } from '../../application/use-cases/refund/EducatorRejectRefundUseCase';
import { EducatorRejectRefundDto } from './dto/educator-reject-refund.dto';

/**
 * Eğiticinin kendi testlerine ait iade taleplerini listelemesi ve yanıtlaması.
 * Sadece EDUCATOR rolüne açıktır.
 */
@Controller('educator/refunds')
@ApiTags('educator/refunds')
export class EducatorRefundsController {
  constructor(
    @Inject(ListEducatorRefundsUseCase) private readonly listRefunds: ListEducatorRefundsUseCase,
    @Inject(EducatorApproveRefundUseCase) private readonly approveRefund: EducatorApproveRefundUseCase,
    @Inject(EducatorRejectRefundUseCase) private readonly rejectRefund: EducatorRejectRefundUseCase,
  ) {}

  @Get()
  @Roles('EDUCATOR', 'ADMIN')
  @ApiBearerAuth('bearer')
  @ApiOkResponse({ description: 'Eğiticinin testlerine ait iade talepleri' })
  @ApiForbiddenResponse({ description: 'Forbidden' })
  async list(@Req() req: any) {
    const educatorId = (req as any).user?.id;
    return this.listRefunds.execute(educatorId);
  }

  @Post(':id/approve')
  @HttpCode(200)
  @Roles('EDUCATOR')
  @ApiBearerAuth('bearer')
  @ApiOkResponse({ description: 'İade talebi eğitici tarafından onaylandı → EDUCATOR_APPROVED' })
  @ApiForbiddenResponse({ description: 'Forbidden' })
  @ApiNotFoundResponse({ description: 'Refund not found' })
  @ApiConflictResponse({ description: 'REFUND_NOT_PENDING' })
  async approve(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    const actorId = (req as any).user?.id;
    return this.approveRefund.execute(id, actorId);
  }

  @Post(':id/reject')
  @HttpCode(200)
  @Roles('EDUCATOR')
  @ApiBearerAuth('bearer')
  @ApiOkResponse({ description: 'İade talebi eğitici tarafından reddedildi → EDUCATOR_REJECTED' })
  @ApiForbiddenResponse({ description: 'Forbidden' })
  @ApiNotFoundResponse({ description: 'Refund not found' })
  @ApiConflictResponse({ description: 'REFUND_NOT_PENDING' })
  async reject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: EducatorRejectRefundDto,
    @Req() req: any,
  ) {
    const actorId = (req as any).user?.id;
    return this.rejectRefund.execute(id, actorId, body?.reason);
  }
}
