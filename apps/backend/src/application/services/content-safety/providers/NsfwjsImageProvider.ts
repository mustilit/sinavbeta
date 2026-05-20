import { Injectable } from '@nestjs/common';
import { ModerationCategory } from '@prisma/client';
import { AppError } from '../../../errors/AppError';
import { logger } from '../../../../infrastructure/logger/logger';
import { Layer1Result } from '../types';
import { IModerationImageProvider } from './IModerationImageProvider';

// NSFW eşikleri
const REJECT_THRESHOLD_PORN = 0.8;
const REJECT_THRESHOLD_HENTAI = 0.8;
const SUSPECT_THRESHOLD_SEXY = 0.7;

/**
 * NSFWjs ile görsel moderasyonu sağlar.
 * @tensorflow-models/nsfwjs + @tensorflow/tfjs-node gerektirir.
 *
 * Paketler lazy-require ile yüklenir: NsfwjsImageProvider yalnızca
 * görsel içerik moderasyonu aktifken instantiate edilmeli.
 */
@Injectable()
export class NsfwjsImageProvider implements IModerationImageProvider {
  /** Model singleton — ilk çağrıda lazy yüklenir */
  private model: any | null = null;
  private modelLoadPromise: Promise<any> | null = null;

  private async getModel(): Promise<any> {
    if (this.model) return this.model;
    if (this.modelLoadPromise) return this.modelLoadPromise;

    this.modelLoadPromise = (async () => {
      try {
        // Dinamik import: paket kurulu değilse anlamlı hata ver
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const nsfwjs: any = await (async () => {
          try { return require('@tensorflow-models/nsfwjs'); } catch {
            throw new AppError('NSFWJS_NOT_INSTALLED', '@tensorflow-models/nsfwjs paketi kurulu değil.', 500);
          }
        })();

        // tfjs-node backend
        await (async () => {
          try { require('@tensorflow/tfjs-node'); } catch {
            throw new AppError('TFJS_NODE_NOT_INSTALLED', '@tensorflow/tfjs-node paketi kurulu değil.', 500);
          }
        })();

        this.model = await nsfwjs.load();
        logger.info('[NsfwjsImageProvider] Model yüklendi');
        return this.model;
      } catch (err) {
        this.modelLoadPromise = null;
        throw err;
      }
    })();

    return this.modelLoadPromise;
  }

  async analyze(
    buffer: Buffer,
    _mediaType: string,
    _tenantId: string,
  ): Promise<Layer1Result> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const tf: any = await (async () => {
      try { return require('@tensorflow/tfjs-node'); } catch {
        throw new AppError('TFJS_NODE_NOT_INSTALLED', '@tensorflow/tfjs-node paketi kurulu değil.', 500);
      }
    })();

    const model = await this.getModel();

    // Buffer → Tensor3D
    const tensor = tf.node.decodeImage(buffer, 3);
    let predictions: Array<{ className: string; probability: number }>;
    try {
      predictions = await model.classify(tensor as any);
    } finally {
      tensor.dispose();
    }

    const scores: Record<string, number> = {};
    for (const p of predictions) {
      scores[p.className] = p.probability;
    }

    const porn = scores['Porn'] ?? 0;
    const hentai = scores['Hentai'] ?? 0;
    const sexy = scores['Sexy'] ?? 0;

    if (porn > REJECT_THRESHOLD_PORN || hentai > REJECT_THRESHOLD_HENTAI) {
      return {
        status: 'REJECTED',
        categories: [ModerationCategory.SEXUAL_CONTENT],
        nsfwScores: scores,
        maxSeverity: 5,
      };
    }

    if (sexy > SUSPECT_THRESHOLD_SEXY) {
      return {
        status: 'SUSPECT',
        categories: [ModerationCategory.SEXUAL_CONTENT],
        nsfwScores: scores,
        maxSeverity: 3,
      };
    }

    return {
      status: 'APPROVED',
      categories: [],
      nsfwScores: scores,
    };
  }
}
