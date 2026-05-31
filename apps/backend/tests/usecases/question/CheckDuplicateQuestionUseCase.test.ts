/**
 * CheckDuplicateQuestionUseCase testleri — kopya soru tespiti (Jaccard >= %75).
 *
 * Doğrulanan davranışlar:
 * - 15 karakterden kısa metin → benzer değil, DB sorgusu yapılmaz
 * - educatorId yoksa → benzer değil
 * - Benzer soru yoksa → isDuplicate=false
 * - Birebir/çok benzer soru (>=%75) → isDuplicate=true + matchedQuestionId
 * - excludeQuestionId where filtresine geçer (düzenlemede kendisiyle eşleşmesin)
 * - Eğiticinin TÜM soruları taranır (yayım durumu/paket filtresi YOK — sadece test.educatorId)
 */

jest.mock('../../../src/infrastructure/database/prisma', () => ({
  prisma: { examQuestion: { findMany: jest.fn() } },
}));

import { CheckDuplicateQuestionUseCase } from '../../../src/application/use-cases/question/CheckDuplicateQuestionUseCase';
import { prisma } from '../../../src/infrastructure/database/prisma';

const mockPrisma = prisma as any;

describe('CheckDuplicateQuestionUseCase', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.examQuestion.findMany.mockResolvedValue([]);
  });

  it('15 karakterden kısa metin → benzer değil, DB sorgusu yapılmaz', async () => {
    const uc = new CheckDuplicateQuestionUseCase();
    const r = await uc.execute('edu-1', 'kısa metin');
    expect(r.isDuplicate).toBe(false);
    expect(r.similarity).toBe(0);
    expect(mockPrisma.examQuestion.findMany).not.toHaveBeenCalled();
  });

  it('educatorId yoksa → benzer değil', async () => {
    const uc = new CheckDuplicateQuestionUseCase();
    const r = await uc.execute('', 'On beş karakterden çok daha uzun bir soru metni');
    expect(r.isDuplicate).toBe(false);
    expect(mockPrisma.examQuestion.findMany).not.toHaveBeenCalled();
  });

  it('benzer soru yoksa → isDuplicate=false', async () => {
    mockPrisma.examQuestion.findMany.mockResolvedValue([
      { id: 'q1', content: 'Tamamen alakasız bambaşka bir konu hakkında metin' },
    ]);
    const uc = new CheckDuplicateQuestionUseCase();
    const r = await uc.execute('edu-1', 'İki kere iki kaç eder dört müdür beş midir');
    expect(r.isDuplicate).toBe(false);
    expect(r.similarity).toBeLessThan(0.75);
  });

  it('birebir aynı soru (>=%75) → isDuplicate=true + matchedQuestionId', async () => {
    const q = 'Türkiye nin başkenti neresidir ve yaklaşık nüfusu ne kadardır';
    mockPrisma.examQuestion.findMany.mockResolvedValue([{ id: 'q9', content: q }]);
    const uc = new CheckDuplicateQuestionUseCase();
    const r = await uc.execute('edu-1', q);
    expect(r.isDuplicate).toBe(true);
    expect(r.similarity).toBeGreaterThanOrEqual(0.75);
    expect(r.matchedQuestionId).toBe('q9');
  });

  it('excludeQuestionId + test.educatorId where filtresine geçer (yayım/paket filtresi yok)', async () => {
    const uc = new CheckDuplicateQuestionUseCase();
    await uc.execute('edu-1', 'On beş karakterden uzun bir soru metni buraya', 'q-self');
    expect(mockPrisma.examQuestion.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { test: { educatorId: 'edu-1' }, id: { not: 'q-self' } },
      }),
    );
  });
});
