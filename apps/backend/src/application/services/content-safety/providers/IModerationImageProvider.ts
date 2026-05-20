import { Layer1Result, Layer2Result } from '../types';

/**
 * Görsel moderasyon sağlayıcısı arayüzü.
 * NsfwjsImageProvider ve ClaudeVisionProvider bu arayüzü uygular.
 */
export interface IModerationImageProvider {
  /**
   * Verilen görsel verisini analiz eder.
   * @param buffer - Ham görsel buffer
   * @param mediaType - MIME tipi
   * @param tenantId - Kiracı ID
   * @returns Katman 1 sonucu (NSFW) veya Katman 2 sonucu (Vision AI)
   */
  analyze(
    buffer: Buffer,
    mediaType: string,
    tenantId: string,
  ): Promise<Layer1Result | Layer2Result>;
}
