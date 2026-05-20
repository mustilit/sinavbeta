// @ts-nocheck
import { Controller, Get, Patch, Query, Param, Body } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOkResponse, ApiForbiddenResponse } from '@nestjs/swagger';
import { Roles } from '../decorators/roles.decorator';
import { ParseUUIDPipe } from '../pipes/parse-uuid.pipe';
import { PrismaUserRepository } from '../../infrastructure/repositories/PrismaUserRepository';
import { ListUsersUseCase } from '../../application/use-cases/admin/ListUsersUseCase';
import { UpdateUserByAdminUseCase } from '../../application/use-cases/admin/UpdateUserByAdminUseCase';

/**
 * Admin kullanıcı yönetimi — tüm kullanıcıları listeler ve admin tarafından günceller.
 * Sadece ADMIN rolüne açıktır.
 */
@Controller('admin/users')
@ApiTags('admin/users')
export class AdminUsersController {
  private readonly listUC = new ListUsersUseCase(new PrismaUserRepository());
  private readonly updateUC = new UpdateUserByAdminUseCase(new PrismaUserRepository());

  @Get()
  @Roles('ADMIN')
  @ApiBearerAuth('bearer')
  @ApiOkResponse({ description: 'List users (admin)' })
  @ApiForbiddenResponse({ description: 'Forbidden' })
  async list(
    @Query('q') q?: string,
    @Query('role') role?: string,
    @Query('status') status?: any,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('sort') sort?: any,
  ) {
    return this.listUC.execute({
      q,
      role,
      status,
      limit: limit != null ? Number(limit) : undefined,
      offset: offset != null ? Number(offset) : undefined,
      sort,
    });
  }

  @Patch(':id')
  @Roles('ADMIN')
  @ApiBearerAuth('bearer')
  @ApiOkResponse({ description: 'Update user (admin)' })
  @ApiForbiddenResponse({ description: 'Forbidden' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: any,
  ) {
    // Frontend compatibility fields:
    // - user_type: candidate|educator
    // - educator_status: pending|approved|rejected
    // - rejection_reason: string
    const role =
      body?.user_type === 'educator' ? 'EDUCATOR'
        : body?.user_type === 'candidate' ? 'CANDIDATE'
        : undefined;

    let educatorApprovedAt: Date | null | undefined = undefined;
    if (body?.educator_status === 'approved') educatorApprovedAt = new Date();
    if (body?.educator_status === 'pending') educatorApprovedAt = null;
    if (body?.educator_status === 'rejected') educatorApprovedAt = null;

    const metadataMerge: Record<string, unknown> = {};
    if (body?.rejection_reason != null) metadataMerge.rejection_reason = String(body.rejection_reason);
    if (body?.educator_status != null) metadataMerge.educator_status = String(body.educator_status);
    if (body?.user_type != null) metadataMerge.user_type = String(body.user_type);

    return this.updateUC.execute(id, {
      ...(role && { role }),
      ...(educatorApprovedAt !== undefined && { educatorApprovedAt }),
      ...(Object.keys(metadataMerge).length > 0 && { metadataMerge }),
    } as any);
  }
}

