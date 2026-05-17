import { Controller, Post, Param, Req, HttpCode, Inject } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOkResponse, ApiForbiddenResponse, ApiNotFoundResponse, ApiConflictResponse, ApiBadRequestResponse } from '@nestjs/swagger';
import { Roles } from '../decorators/roles.decorator';
import { ParseUUIDPipe } from '../pipes/parse-uuid.pipe';
import { ApproveEducatorUseCase } from '../../application/use-cases/educator/ApproveEducatorUseCase';
import { SuspendEducatorUseCase } from '../../application/use-cases/educator/SuspendEducatorUseCase';
import { UnsuspendEducatorUseCase } from '../../application/use-cases/educator/UnsuspendEducatorUseCase';

/**
 * Admin eğitici durum yönetimi — eğiticiyi onaylama, askıya alma ve askıyı kaldırma.
 * Sadece ADMIN rolüne açıktır.
 */
@Controller('admin/educators')
@ApiTags('admin/educators')
export class AdminEducatorsController {
  constructor(
    @Inject(ApproveEducatorUseCase) private readonly approveEducator: ApproveEducatorUseCase,
    @Inject(SuspendEducatorUseCase) private readonly suspendEducator: SuspendEducatorUseCase,
    @Inject(UnsuspendEducatorUseCase) private readonly unsuspendEducator: UnsuspendEducatorUseCase,
  ) {}

  @Post(':id/approve')
  @HttpCode(200)
  @Roles('ADMIN')
  @ApiBearerAuth('bearer')
  @ApiOkResponse({ description: 'Educator approved (or already approved)' })
  @ApiForbiddenResponse({ description: 'Forbidden' })
  @ApiNotFoundResponse({ description: 'User not found' })
  @ApiConflictResponse({ description: 'User is not an educator' })
  @ApiBadRequestResponse({ description: 'Invalid UUID' })
  async approve(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    const actorId = (req as any).user?.id;
    return this.approveEducator.execute(actorId, id);
  }

  @Post(':id/suspend')
  @HttpCode(200)
  @Roles('ADMIN')
  @ApiBearerAuth('bearer')
  @ApiOkResponse({ description: 'Educator suspended' })
  @ApiForbiddenResponse({ description: 'Forbidden' })
  @ApiNotFoundResponse({ description: 'User not found' })
  @ApiConflictResponse({ description: 'User is not an educator' })
  @ApiBadRequestResponse({ description: 'Invalid UUID' })
  async suspend(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    const actorId = (req as any).user?.id;
    return this.suspendEducator.execute(actorId, id);
  }

  @Post(':id/unsuspend')
  @HttpCode(200)
  @Roles('ADMIN')
  @ApiBearerAuth('bearer')
  @ApiOkResponse({ description: 'Educator unsuspended' })
  @ApiForbiddenResponse({ description: 'Forbidden' })
  @ApiNotFoundResponse({ description: 'User not found' })
  @ApiConflictResponse({ description: 'User is not an educator' })
  @ApiBadRequestResponse({ description: 'Invalid UUID' })
  async unsuspend(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    const actorId = (req as any).user?.id;
    return this.unsuspendEducator.execute(actorId, id);
  }
}
