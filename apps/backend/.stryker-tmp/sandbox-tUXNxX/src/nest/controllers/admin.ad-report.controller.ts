// @ts-nocheck
import { Controller, Get, Query, Inject } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOkResponse, ApiOperation } from '@nestjs/swagger';
import { Roles } from '../decorators/roles.decorator';
import { GetAdminAdReportUseCase } from '../../application/use-cases/admin/GetAdminAdReportUseCase';

/**
 * AdminAdReportController — FR-Y-10
 * Eğiticilerin reklam satın alımlarını filtreli olarak listeler.
 * Sadece ADMIN rolüne açıktır.
 */
@Controller('admin/ads/report')
@ApiTags('admin/ads/report')
@ApiBearerAuth('bearer')
export class AdminAdReportController {
  constructor(@Inject(GetAdminAdReportUseCase) private readonly reportUC: GetAdminAdReportUseCase) {}

  /**
   * Reklam satın alım raporunu döndürür.
   * Filtre parametreleri opsiyoneldir; belirtilmeyen filtreler görmezden gelinir.
   *
   * @param year      - Yıl filtresi (opsiyonel)
   * @param month     - Ay filtresi (opsiyonel, 1-12)
   * @param educatorId - Belirli eğiticiye göre filtrele (opsiyonel)
   * @param targetType - 'TEST' veya 'EDUCATOR' (opsiyonel)
   */
  @Get()
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Admin reklam satın alım raporu — filtreli liste' })
  @ApiOkResponse({ description: 'Filtered ad purchase report' })
  async report(
    @Query('year') year?: string,
    @Query('month') month?: string,
    @Query('educatorId') educatorId?: string,
    @Query('targetType') targetType?: string,
  ) {
    return this.reportUC.execute({
      // String parametreleri parseInt ile sayıya çevir; boş değerlerde undefined bırak
      year: year ? parseInt(year, 10) : undefined,
      month: month ? parseInt(month, 10) : undefined,
      educatorId: educatorId || undefined,
      // Yalnızca geçerli targetType değerlerine izin ver; diğerleri filtre dışı
      targetType: (targetType === 'TEST' || targetType === 'EDUCATOR') ? targetType : undefined,
    });
  }
}
