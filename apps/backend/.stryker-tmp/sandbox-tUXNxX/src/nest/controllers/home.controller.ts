// @ts-nocheck
import { Controller, Get, Query, Req } from '@nestjs/common';
import { Roles } from '../decorators/roles.decorator';
import { GetRecommendedDto } from './dto/get-recommended.dto';
import { GetRecommendedTestsUseCase } from '../../application/use-cases/package/GetRecommendedTestsUseCase';
import { SelectAdSlotsUseCase } from '../../application/use-cases/ad/SelectAdSlotsUseCase';
import { RecordAdImpressionsUseCase } from '../../application/use-cases/ad/RecordAdImpressionsUseCase';
import { PrismaExamRepository } from '../../infrastructure/repositories/PrismaExamRepository';
import { PrismaFollowRepository } from '../../infrastructure/repositories/PrismaFollowRepository';
import { ApiTags, ApiBearerAuth, ApiOkResponse } from '@nestjs/swagger';
import { ApiErrorResponses } from '../swagger/decorators';
import { HomeRecommendedResponseDto } from './dto/home-recommended.response.dto';

/**
 * Ana sayfa endpoint'leri — adaya özel öneri test listesini döndürür.
 * Sonuçların %10'u aktif reklam satın alımlarından seçilir (AD_BOOSTED).
 * Reklamlar, kişiselleştirilmiş (FOLLOWED_EDUCATOR/FOLLOWED_EXAMTYPE) slotları ezmez;
 * fallback (POPULAR) slotlarından alınır.
 */
@Controller('home')
@ApiTags('Home')
export class HomeController {
  private uc: GetRecommendedTestsUseCase;
  private adSelectUC: SelectAdSlotsUseCase;
  private adRecordUC: RecordAdImpressionsUseCase;

  constructor() {
    this.uc          = new GetRecommendedTestsUseCase(new PrismaExamRepository(), new PrismaFollowRepository());
    this.adSelectUC  = new SelectAdSlotsUseCase();
    this.adRecordUC  = new RecordAdImpressionsUseCase();
  }

  @Get('recommended-tests')
  @Roles('CANDIDATE')
  @ApiBearerAuth('bearer')
  @ApiOkResponse({ type: HomeRecommendedResponseDto })
  @ApiErrorResponses()
  async recommended(@Query() q: GetRecommendedDto, @Req() req: any) {
    const candidateId = (req as any).user?.id;
    const totalLimit  = Math.min(Math.max(q.limit ?? 20, 1), 50);

    // %10 ad slot, en az 0 — küçük limitlerde 0 olabilir
    const adCount      = Math.floor(totalLimit * 0.1);
    // Organik limit: reklamlar fallback slotundan kesildiğinden organik limite dahil
    const organicLimit = totalLimit;

    // Organik kişiselleştirilmiş öneriler (takip edilenler %60 + popular %40)
    const organic = await this.uc.execute(candidateId, organicLimit, q.examTypeId);
    const organicIds = organic.items.map((i: any) => i.id);

    let finalItems = organic.items as any[];
    let adSlots: any[] = [];

    if (adCount > 0) {
      // Aktif reklamları seç — organik listede zaten olanları dışla
      const selectedAds = await this.adSelectUC.execute(adCount, organicIds);

      if (selectedAds.length > 0) {
        // Impression'ları arka planda kaydet (response'u bloklamaz)
        this.adRecordUC.execute(
          selectedAds.map((p) => ({ id: p.id, educatorId: p.educatorId, testId: p.testId ?? null })),
          candidateId ?? null,
        ).catch(() => { /* sessiz hata — impression kaydı kritik değil */ });

        // TEST türü reklamları test summary formatına dönüştür
        adSlots = selectedAds
          .filter((p) => p.targetType === 'TEST' && p.test)
          .map((p) => ({
            id:            p.test!.id,
            title:         (p.test as any).title,
            educatorId:    p.educatorId,
            examTypeId:    (p.test as any).examTypeId ?? null,
            priceCents:    (p.test as any).priceCents ?? null,
            currency:      (p.test as any).currency ?? 'TRY',
            isTimed:       (p.test as any).isTimed,
            questionCount: (p.test as any).questionCount ?? null,
            tags:          ['AD_BOOSTED'],
            adPurchaseId:  p.id, // frontend'in izlemesi için
          }));

        // Reklamları fallback (POPULAR) öğelerin arasına serpiştir
        // Kişiselleştirilmiş öğelere (FOLLOWED_*) dokunulmaz
        const followed  = finalItems.filter((i: any) => i.tags?.some((t: string) => t.startsWith('FOLLOWED_')));
        const popular   = finalItems.filter((i: any) => !i.tags?.some((t: string) => t.startsWith('FOLLOWED_')));

        // Popular slotlarından en sona yerleştir — kişiselleştirmeyi etkileme
        const popularCapped = popular.slice(0, Math.max(0, popular.length - adSlots.length));
        finalItems = [...followed, ...popularCapped, ...adSlots];
      }
    }

    return {
      items: finalItems.slice(0, totalLimit),
      meta:  {
        limit:          totalLimit,
        followedBoosted: organic.meta.followedBoosted,
        fallbackCount:   organic.meta.fallbackCount,
        adCount:         adSlots.length,
      },
    };
  }
}
