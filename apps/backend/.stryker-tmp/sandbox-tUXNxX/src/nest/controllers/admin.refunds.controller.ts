// @ts-nocheck
import { Controller, Get, Post, Param, Body, Req, Query, HttpCode, Inject } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOkResponse, ApiForbiddenResponse, ApiNotFoundResponse, ApiConflictResponse, ApiBadRequestResponse } from '@nestjs/swagger';
import { Roles } from '../decorators/roles.decorator';
import { ParseUUIDPipe } from '../pipes/parse-uuid.pipe';
import { ApproveRefundUseCase } from '../../application/use-cases/refund/ApproveRefundUseCase';
import { RejectRefundUseCase } from '../../application/use-cases/refund/RejectRefundUseCase';
import { ListPendingRefundsUseCase } from '../../application/use-cases/refund/ListPendingRefundsUseCase';
import { RejectRefundDto } from './dto/reject-refund.dto';
import { ListRefundsQueryDto } from './dto/list-refunds-query.dto';

/**
 * Admin iade yönetimi — bekleyen iade taleplerini listeler, onaylar veya reddeder.
 * Sadece ADMIN rolüne açıktır.
 */
@Controller('admin/refunds')
@ApiTags('admin/refunds')
export class AdminRefundsController {
  constructor(
    @Inject(ApproveRefundUseCase) private readonly approveRefund: ApproveRefundUseCase,
    @Inject(RejectRefundUseCase) private readonly rejectRefund: RejectRefundUseCase,
    @Inject(ListPendingRefundsUseCase) private readonly listPendingRefunds: ListPendingRefundsUseCase,
  ) {}

  @Get()
  @Roles('ADMIN')
  @ApiBearerAuth('bearer')
  @ApiOkResponse({ description: 'List of refunds by status (default PENDING)' })
  @ApiForbiddenResponse({ description: 'Forbidden' })
  async list(@Query() query: ListRefundsQueryDto) {
    const status = query.status ?? 'PENDING';
    return this.listPendingRefunds.execute(status);
  }

  @Post(':id/approve')
  @HttpCode(200)
  @Roles('ADMIN')
  @ApiBearerAuth('bearer')
  @ApiOkResponse({ description: 'Refund approved' })
  @ApiForbiddenResponse({ description: 'Forbidden' })
  @ApiNotFoundResponse({ description: 'Refund not found' })
  @ApiConflictResponse({ description: 'REFUND_ALREADY_DECIDED' })
  @ApiBadRequestResponse({ description: 'Invalid UUID' })
  async approve(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    const actorId = (req as any).user?.id;
    return this.approveRefund.execute(id, actorId);
  }

  @Post(':id/reject')
  @HttpCode(200)
  @Roles('ADMIN')
  @ApiBearerAuth('bearer')
  @ApiOkResponse({ description: 'Refund rejected' })
  @ApiForbiddenResponse({ description: 'Forbidden' })
  @ApiNotFoundResponse({ description: 'Refund not found' })
  @ApiConflictResponse({ description: 'REFUND_ALREADY_DECIDED' })
  @ApiBadRequestResponse({ description: 'Invalid UUID or reason too short' })
  async reject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: RejectRefundDto,
    @Req() req: any,
  ) {
    const actorId = (req as any).user?.id;
    return this.rejectRefund.execute(id, actorId, body?.reason);
  }
}
