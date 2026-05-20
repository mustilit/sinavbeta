// @ts-nocheck
import { IObjectionRepository, TestReportStat } from '../../../domain/interfaces/IObjectionRepository';

/**
 * Eğitici paneli "Hata Bildirimleri" sayfası için test bazında itiraz istatistiklerini döner.
 * Her test için toplam, bekleyen ve eskalasyon sayıları gelir.
 */
export class ListTestReportStatsUseCase {
  constructor(private readonly objectionRepo: IObjectionRepository) {}

  async execute(): Promise<TestReportStat[]> {
    return this.objectionRepo.listTestReportStats();
  }
}
