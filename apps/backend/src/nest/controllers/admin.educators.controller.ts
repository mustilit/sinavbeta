import { Controller, Post, Get, Param, Req, Body, HttpCode, Inject, NotFoundException } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOkResponse, ApiForbiddenResponse, ApiNotFoundResponse, ApiConflictResponse, ApiBadRequestResponse } from '@nestjs/swagger';
import { Roles } from '../decorators/roles.decorator';
import { ParseUUIDPipe } from '../pipes/parse-uuid.pipe';
import { ApproveEducatorUseCase } from '../../application/use-cases/educator/ApproveEducatorUseCase';
import { RejectEducatorUseCase } from '../../application/use-cases/educator/RejectEducatorUseCase';
import { SuspendEducatorUseCase } from '../../application/use-cases/educator/SuspendEducatorUseCase';
import { UnsuspendEducatorUseCase } from '../../application/use-cases/educator/UnsuspendEducatorUseCase';
import { prisma } from '../../infrastructure/database/prisma';

/**
 * Admin eğitici durum yönetimi — eğiticiyi onaylama, askıya alma ve askıyı kaldırma.
 * Sadece ADMIN rolüne açıktır.
 */
@Controller('admin/educators')
@ApiTags('admin/educators')
export class AdminEducatorsController {
  constructor(
    @Inject(ApproveEducatorUseCase) private readonly approveEducator: ApproveEducatorUseCase,
    @Inject(RejectEducatorUseCase) private readonly rejectEducator: RejectEducatorUseCase,
    @Inject(SuspendEducatorUseCase) private readonly suspendEducator: SuspendEducatorUseCase,
    @Inject(UnsuspendEducatorUseCase) private readonly unsuspendEducator: UnsuspendEducatorUseCase,
  ) {}

  /**
   * Admin için eğitici başvurusu detayı — tüm kullanıcı bilgisi + metadata + uzmanlık adları
   * + sözleşme kabul kayıtları + (varsa) red sebebi. "İncele" popup'ı bunu çeker.
   * Raw SQL: status::text cast ile REJECTED dahil tüm durumlarda enum hatası çıkmaz.
   */
  @Get(':id')
  @Roles('ADMIN')
  @ApiBearerAuth('bearer')
  @ApiOkResponse({ description: 'Educator application detail (admin review)' })
  @ApiForbiddenResponse({ description: 'Forbidden' })
  @ApiNotFoundResponse({ description: 'Educator not found' })
  async getDetail(@Param('id', ParseUUIDPipe) id: string) {
    const rows = await prisma.$queryRaw<any[]>`
      SELECT id, email, username, "firstName", "lastName", bio,
             role::text AS role, status::text AS status,
             "emailVerified", "educatorApprovedAt",
             "rejectionReason", "rejectedAt",
             metadata, "createdAt"
      FROM users WHERE id = ${id} LIMIT 1
    `;
    const user = rows[0];
    if (!user) throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'Kullanıcı bulunamadı' });
    if (user.role !== 'EDUCATOR') throw new NotFoundException({ code: 'USER_NOT_EDUCATOR', message: 'Kullanıcı eğitici değil' });

    // Uzmanlık alanlarını adlarıyla çöz (metadata.specialized_exam_types id listesi)
    const specIds: string[] = Array.isArray(user.metadata?.specialized_exam_types)
      ? user.metadata.specialized_exam_types
      : [];
    let specializations: Array<{ id: string; name: string }> = [];
    if (specIds.length) {
      const types = await prisma.examType.findMany({
        where: { id: { in: specIds } },
        select: { id: true, name: true },
      });
      const byId = new Map(types.map((t) => [t.id, t.name]));
      specializations = specIds.map((sid) => ({ id: sid, name: byId.get(sid) ?? sid }));
    }

    // Sözleşme kabul kayıtları (delil)
    const acceptances = await prisma.contractAcceptance.findMany({
      where: { userId: id },
      select: {
        contract: { select: { type: true, version: true, title: true } },
        acceptedAt: true,
        ip: true,
        userAgent: true,
      },
      orderBy: { acceptedAt: 'desc' },
    });

    return {
      id: user.id,
      email: user.email,
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName,
      bio: user.bio,
      role: user.role,
      status: user.status,
      emailVerified: user.emailVerified,
      educatorApprovedAt: user.educatorApprovedAt,
      rejectionReason: user.rejectionReason,
      rejectedAt: user.rejectedAt,
      createdAt: user.createdAt,
      metadata: {
        cv_url: user.metadata?.cv_url ?? null,
        education_info: user.metadata?.education_info ?? null,
        bio: user.metadata?.bio ?? null,
      },
      specializations,
      contractAcceptances: acceptances,
    };
  }

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

  /** Eğitici başvurusunu reddet — sebep zorunlu. Status REJECTED + rejectionReason kaydedilir. */
  @Post(':id/reject')
  @HttpCode(200)
  @Roles('ADMIN')
  @ApiBearerAuth('bearer')
  @ApiOkResponse({ description: 'Educator rejected (or already rejected)' })
  @ApiForbiddenResponse({ description: 'Forbidden' })
  @ApiNotFoundResponse({ description: 'User not found' })
  @ApiConflictResponse({ description: 'User is not an educator' })
  @ApiBadRequestResponse({ description: 'Reason missing or invalid UUID' })
  async reject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { reason?: string },
    @Req() req: any,
  ) {
    const actorId = (req as any).user?.id;
    return this.rejectEducator.execute(actorId, id, body?.reason ?? '');
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
