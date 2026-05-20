import { Layer1Result, Layer2Result } from '../types';

/**
 * Kural tabanlı veya AI destekli metin moderasyon sağlayıcısı arayüzü.
 * BlocklistTextProvider ve ClaudeTextProvider bu arayüzü uygular.
 */
export interface IModerationTextProvider {
  /**
   * Verilen metni analiz eder.
   * @param text - Moderasyona tabi tutulacak ham metin
   * @param tenantId - Kiracı ID (kural tabanlı provider'lar için gerekli)
   * @returns Katman 1 sonucu (kural tabanlı) veya Katman 2 sonucu (AI)
   */
  analyze(text: string, tenantId: string): Promise<Layer1Result | Layer2Result>;
}
