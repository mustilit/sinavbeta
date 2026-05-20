import * as fs from 'fs';
import * as path from 'path';
import { Injectable } from '@nestjs/common';
import { ModerationCategory } from '@prisma/client';
import { AppError } from '../../../errors/AppError';
import { logger } from '../../../../infrastructure/logger/logger';
import { AiModerationScore, Layer2Result } from '../types';
import { IModerationImageProvider } from './IModerationImageProvider';

/** Token başına yaklaşık maliyet (ClaudeTextProvider ile aynı tablo) */
const COST_TABLE: Record<string, { inputPer1M: number; outputPer1M: number }> = {
  'claude-3-haiku': { inputPer1M: 1.0, outputPer1M: 5.0 },
  'claude-3-5-haiku': { inputPer1M: 1.0, outputPer1M: 5.0 },
  'claude-sonnet-4-6': { inputPer1M: 3.0, outputPer1M: 15.0 },
  'claude-3-5-sonnet': { inputPer1M: 3.0, outputPer1M: 15.0 },
  'claude-opus': { inputPer1M: 15.0, outputPer1M: 75.0 },
};
const DEFAULT_COST = { inputPer1M: 3.0, outputPer1M: 15.0 };

/** Sistem prompt — cold start'ta bir kez okunur */
const SYSTEM_PROMPT = fs.readFileSync(
  path.join(__dirname, '../prompts/vision-moderation.tr.md'),
  'utf-8',
);

function resolveCost(
  modelName: string,
  inputTokens: number,
  outputTokens: number,
): number | null {
  const overrideInput = Number(process.env.MODERATION_COST_INPUT_PER_1M);
  const overrideOutput = Number(process.env.MODERATION_COST_OUTPUT_PER_1M);

  const rates =
    Number.isFinite(overrideInput) && Number.isFinite(overrideOutput)
      ? { inputPer1M: overrideInput, outputPer1M: overrideOutput }
      : (Object.entries(COST_TABLE).find(([key]) => modelName.includes(key))?.[1] ??
          DEFAULT_COST);

  return (
    (inputTokens * rates.inputPer1M + outputTokens * rates.outputPer1M) / 1_000_000
  );
}

function parseCategoryList(raw: string[]): ModerationCategory[] {
  const valid = new Set<string>([
    'HATE_SPEECH', 'VIOLENCE', 'SEXUAL_CONTENT', 'SELF_HARM',
    'HARASSMENT', 'ILLEGAL', 'PROFANITY', 'SPAM',
    'MISINFORMATION', 'PERSONAL_DATA', 'COPYRIGHT', 'OTHER',
  ]);
  return raw.filter((c) => valid.has(c)) as ModerationCategory[];
}

/** Desteklenen base64 media type'lar */
type AnthropicMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

@Injectable()
export class ClaudeVisionProvider implements IModerationImageProvider {
  private readonly apiKey: string;

  constructor(
    /** Claude vision model adı — AdminSettings.moderationModelVision'dan gelir */
    private readonly modelName: string,
  ) {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) {
      throw new AppError(
        'ANTHROPIC_API_KEY_MISSING',
        'ANTHROPIC_API_KEY ortam değişkeni tanımlı değil.',
        500,
      );
    }
    this.apiKey = key;
  }

  async analyze(
    buffer: Buffer,
    mediaType: string,
    _tenantId: string,
  ): Promise<Layer2Result> {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Anthropic: any = await (async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const mod = require('@anthropic-ai/sdk');
        return mod.default ?? mod;
      } catch {
        throw new AppError(
          'ANTHROPIC_SDK_NOT_INSTALLED',
          '@anthropic-ai/sdk paketi kurulu değil.',
          500,
        );
      }
    })();

    const client = new Anthropic({ apiKey: this.apiKey });
    const base64Image = buffer.toString('base64');

    // Desteklenmeyen media type'ı varsayılana düşür
    const safeMediaType: AnthropicMediaType = (
      ['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(mediaType)
        ? mediaType
        : 'image/jpeg'
    ) as AnthropicMediaType;

    const startMs = Date.now();
    let response: any;

    try {
      response = await client.messages.create({
        model: this.modelName,
        max_tokens: 1024,
        system: [
          {
            type: 'text',
            text: SYSTEM_PROMPT,
            cache_control: { type: 'ephemeral' },
          },
        ] as any,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: safeMediaType,
                  data: base64Image,
                },
              },
              {
                type: 'text',
                text: 'Lütfen bu görseli değerlendir ve JSON formatında yanıt ver.',
              },
            ],
          },
        ],
      });
    } catch (err: any) {
      logger.error('[ClaudeVisionProvider] API hatası', { error: err?.message });
      throw new AppError('CLAUDE_VISION_API_ERROR', `Claude Vision API hatası: ${err?.message}`, 502);
    }

    const latencyMs = Date.now() - startMs;
    const inputTokens: number = response.usage?.input_tokens ?? 0;
    const outputTokens: number = response.usage?.output_tokens ?? 0;
    const rawText = response.content?.[0]?.text ?? '{}';

    let parsed: any;
    try {
      const jsonMatch = rawText.match(/```json\s*([\s\S]*?)```/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[1] : rawText);
    } catch {
      logger.warn('[ClaudeVisionProvider] JSON parse başarısız', { rawText });
      parsed = { verdict: 'SUSPECT', scores: {}, categories: [], reasoning: 'Parse hatası' };
    }

    const scores: AiModerationScore = {
      hate: parsed.scores?.hate ?? 0,
      sexual: parsed.scores?.sexual ?? 0,
      violence: parsed.scores?.violence ?? 0,
      personalData: parsed.scores?.personalData ?? 0,
      spam: parsed.scores?.spam ?? 0,
      overall: parsed.scores?.overall ?? 0,
    };

    return {
      scores,
      categories: parseCategoryList(parsed.categories ?? []),
      verdict: ['APPROVED', 'REJECTED', 'SUSPECT'].includes(parsed.verdict)
        ? parsed.verdict
        : 'SUSPECT',
      reasoning: String(parsed.reasoning ?? ''),
      raw: response,
      costUsd: resolveCost(this.modelName, inputTokens, outputTokens),
      latencyMs,
      tokensUsed: { input: inputTokens, output: outputTokens },
    };
  }
}
