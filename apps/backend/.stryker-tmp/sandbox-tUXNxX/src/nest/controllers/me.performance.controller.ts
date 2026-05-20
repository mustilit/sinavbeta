// @ts-nocheck
import { Controller, Get, Req, Inject } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOkResponse } from '@nestjs/swagger';
import { Roles } from '../decorators/roles.decorator';
import { GetTopicPerformanceUseCase } from '../../application/use-cases/report/GetTopicPerformanceUseCase';

/**
 * Adayın kişisel performans raporlarını sunan endpoint'ler.
 * CANDIDATE ve ADMIN rollerine açıktır.
 * /me/* prefix'i altında çalışır.
 */
@Controller('me')
@ApiTags('me')
@ApiBearerAuth('bearer')
export class MePerformanceController {
  constructor(
    @Inject(GetTopicPerformanceUseCase) private readonly topicPerformanceUC: GetTopicPerformanceUseCase,
  ) {}

  /**
   * Adayın konu bazlı performans raporu.
   * Farklı test paketlerindeki aynı konuya ait soruları sınav türüne göre gruplar
   * ve her grubun zaman serisini (attempt başına pct) döndürür.
   *
   * Döndürür:
   *   - groups: (topicId × examTypeId) başına istatistik + timeline
   *   - examTypes: filtreleme için benzersiz sınav türleri listesi
   */
  @Get('topic-performance')
  @Roles('CANDIDATE', 'ADMIN')
  @ApiOkResponse({
    description:
      'Konu × sınav türü bazlı performans grupları ve zaman serisi (yalnızca SUBMITTED/TIMEOUT denemeler)',
  })
  async topicPerformance(@Req() req: any) {
    // JWT guard'ın inject ettiği kullanıcı ID'sini al
    const candidateId = (req as any).user?.id;
    return this.topicPerformanceUC.execute(candidateId);
  }
}
