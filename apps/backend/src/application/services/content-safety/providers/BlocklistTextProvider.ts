import { Injectable } from '@nestjs/common';
import { ModerationCategory } from '@prisma/client';
import { IBlockedTermRepository } from '../../../../domain/interfaces/IBlockedTermRepository';
import { logger } from '../../../../infrastructure/logger/logger';
import { Layer1Result } from '../types';
import { turkishNormalize } from '../utils/turkishNormalize';
import { IModerationTextProvider } from './IModerationTextProvider';

/** Severity eşiği: bu değerin üzerindeki veya eşit olan terimlerde REJECT */
const REJECT_SEVERITY_THRESHOLD = 4;

/** Otomatik REJECT yapılan kategoriler — plan §3.1 */
const AUTO_REJECT_CATEGORIES = new Set<ModerationCategory>([
  ModerationCategory.HATE_SPEECH,
  ModerationCategory.SEXUAL_CONTENT,
  ModerationCategory.SELF_HARM,
]);

@Injectable()
export class BlocklistTextProvider implements IModerationTextProvider {
  constructor(private readonly blockedTermRepo: IBlockedTermRepository) {}

  async analyze(text: string, tenantId: string): Promise<Layer1Result> {
    const normalizedInput = turkishNormalize(text);
    const terms = await this.blockedTermRepo.findActiveByTenant(tenantId);

    const matchedTerms: string[] = [];
    const matchedCategories = new Set<ModerationCategory>();
    let maxSeverity = 0;

    for (const record of terms) {
      const severity = record.severity ?? 1;
      // pattern doluysa regex eşleşmesi, yoksa literal substring
      const matched = record.pattern
        ? this.matchRegex(normalizedInput, record.pattern, record.id)
        : this.matchLiteral(normalizedInput, record.term);

      if (matched) {
        matchedTerms.push(record.term);
        matchedCategories.add(record.category);
        if (severity > maxSeverity) maxSeverity = severity;
      }
    }

    if (matchedTerms.length === 0) {
      return { status: 'APPROVED', categories: [], matchedTerms: [], maxSeverity: 0 };
    }

    // Otomatik REJECT koşulları
    const hasAutoRejectCategory = [...matchedCategories].some((c) =>
      AUTO_REJECT_CATEGORIES.has(c),
    );
    const isHighSeverity = maxSeverity >= REJECT_SEVERITY_THRESHOLD;

    const status: Layer1Result['status'] =
      hasAutoRejectCategory || isHighSeverity ? 'REJECTED' : 'SUSPECT';

    return {
      status,
      matchedTerms,
      maxSeverity,
      categories: [...matchedCategories],
    };
  }

  private matchLiteral(normalizedInput: string, term: string): boolean {
    return normalizedInput.includes(turkishNormalize(term));
  }

  private matchRegex(input: string, pattern: string, termId: string): boolean {
    try {
      const regex = new RegExp(pattern, 'i');
      return regex.test(input);
    } catch (err) {
      // Hatalı regex: log + atla
      logger.warn('[BlocklistTextProvider] Geçersiz regex pattern atlandı', {
        termId,
        pattern,
      });
      return false;
    }
  }
}
