import { RedisCache } from '../../../infrastructure/cache/RedisCache';
import { PrismaBlockedTermRepository } from '../../../infrastructure/repositories/PrismaBlockedTermRepository';
import { PrismaModerationResultRepository } from '../../../infrastructure/repositories/PrismaModerationResultRepository';
import { PrismaModerationViolationRepository } from '../../../infrastructure/repositories/PrismaModerationViolationRepository';
import { PrismaEducatorRiskScoreRepository } from '../../../infrastructure/repositories/PrismaEducatorRiskScoreRepository';
import { PrismaModerationActionRepository } from '../../../infrastructure/repositories/PrismaModerationActionRepository';
import { BlocklistTextProvider } from './providers/BlocklistTextProvider';
import { NsfwjsImageProvider } from './providers/NsfwjsImageProvider';
import { ContentSafetyService } from './ContentSafetyService';
import { ModerateTextContentUseCase } from '../../use-cases/moderation/ModerateTextContentUseCase';

/**
 * Paylaşımlı `ModerateTextContentUseCase` singleton'ı.
 *
 * Neden: Review/EducatorProfile use case'leri controller'larda manuel `new`
 * ediliyor (tsx/esbuild reflect-metadata yaymadığı için DI kullanmıyorlar). Bu
 * use case'lere moderasyon enjekte etmek için modül DI grafiğini değiştirmek
 * yerine, tek construction path'i burada toplandı. CreateLiveSessionUseCase (DI)
 * de app.module factory'sinden bunu kullanır — böylece ContentSafetyService +
 * Redis bağlantısı tek instance olarak paylaşılır (per-request yeniden kurulmaz).
 *
 * Lazy: ilk çağrıda kurulur, sonra cache'lenir. Test ortamında use case'lere
 * `moderate` enjekte EDİLMEZ (opsiyonel param), bu yüzden testler bu singleton'a
 * dokunmaz — Redis/DB gerektirmez.
 */
let _instance: ModerateTextContentUseCase | null = null;

export function getSharedModerateTextContentUseCase(): ModerateTextContentUseCase {
  if (_instance) return _instance;

  const cache = new RedisCache();
  const blockedTermRepo = new PrismaBlockedTermRepository(cache);
  const blocklist = new BlocklistTextProvider(blockedTermRepo);
  const nsfwjs = new NsfwjsImageProvider();
  const contentSafety = new ContentSafetyService(blocklist, nsfwjs);

  _instance = new ModerateTextContentUseCase(
    contentSafety,
    new PrismaModerationResultRepository(),
    new PrismaModerationViolationRepository(),
    new PrismaEducatorRiskScoreRepository(),
    new PrismaModerationActionRepository(),
  );
  return _instance;
}

/** Test izolasyonu için singleton'ı sıfırla. */
export function _resetSharedModerationForTest(): void {
  _instance = null;
}
