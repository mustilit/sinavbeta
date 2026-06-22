/**
 * CheckDuplicateWrittenQuestionUseCase unit testleri.
 * Jaccard benzerligi ile kopya soru tespiti.
 */
jest.mock('../../../src/infrastructure/database/prisma', () => ({
  prisma: {
    writtenQuestion: { findMany: jest.fn() },
  },
}));

import { CheckDuplicateWrittenQuestionUseCase } from '../../../src/application/use-cases/written/CheckDuplicateWrittenQuestionUseCase';
import { prisma } from '../../../src/infrastructure/database/prisma';

const p = prisma as any;
beforeEach(() => jest.clearAllMocks());

describe('CheckDuplicateWrittenQuestionUseCase', () => {
  const uc = new CheckDuplicateWrittenQuestionUseCase();

  // ─── Kisa devre (short circuit) testleri ─────────────────

  it('educatorId bos ise duplicate degil', async () => {
    const result = await uc.execute('', 'Yeterince uzun metin icerigi var');
    expect(result.isDuplicate).toBe(false);
    expect(result.similarity).toBe(0);
    expect(p.writtenQuestion.findMany).not.toHaveBeenCalled();
  });

  it('content 15 karakterden kisa ise duplicate degil', async () => {
    const result = await uc.execute('edu1', 'Kisa');
    expect(result.isDuplicate).toBe(false);
    expect(p.writtenQuestion.findMany).not.toHaveBeenCalled();
  });

  it('content null ise duplicate degil', async () => {
    const result = await uc.execute('edu1', null as any);
    expect(result.isDuplicate).toBe(false);
    expect(p.writtenQuestion.findMany).not.toHaveBeenCalled();
  });

  it('content bos string ise duplicate degil', async () => {
    const result = await uc.execute('edu1', '');
    expect(result.isDuplicate).toBe(false);
  });

  it('tokenize sonucu bos ise duplicate degil', async () => {
    // Sadece tek karakterlerden olusan metin → filtrelenir (length >= 2)
    const result = await uc.execute('edu1', 'a b c d e f g h i j k l m n o');
    expect(result.isDuplicate).toBe(false);
    expect(p.writtenQuestion.findMany).not.toHaveBeenCalled();
  });

  // ─── Eslesme (match) testleri ────────────────────────────

  it('ayni metin gonderilirse isDuplicate true doner', async () => {
    const content = 'Turkiyenin baskenti neresidir aciklayiniz';
    p.writtenQuestion.findMany.mockResolvedValue([
      { id: 'q1', content },
    ]);
    const result = await uc.execute('edu1', content);
    expect(result.isDuplicate).toBe(true);
    expect(result.similarity).toBe(1);
    expect(result.matchedQuestionId).toBe('q1');
    expect(result.matchedContent).toBe(content);
  });

  it('benzerlik %75 uzerinde ise isDuplicate true', async () => {
    // Jaccard = kesişim/birleşim. 8+8 token, 7 ortak → 7/(16-7)=7/9≈0.78 ≥ 0.75
    const original = 'matematik geometri fizik kimya biyoloji turkce tarih cografya';
    const similar = 'matematik geometri fizik kimya biyoloji turkce tarih deneme';
    p.writtenQuestion.findMany.mockResolvedValue([{ id: 'q2', content: original }]);
    const result = await uc.execute('edu1', similar);
    expect(result.isDuplicate).toBe(true);
    expect(result.similarity).toBeGreaterThanOrEqual(0.75);
    expect(result.matchedQuestionId).toBe('q2');
  });

  it('benzerlik %75 altinda ise isDuplicate false', async () => {
    const original = 'matematik geometri fizik kimya biyoloji';
    const different = 'edebiyat resim muzik beden spor';
    p.writtenQuestion.findMany.mockResolvedValue([{ id: 'q3', content: original }]);
    const result = await uc.execute('edu1', different);
    expect(result.isDuplicate).toBe(false);
    expect(result.similarity).toBeLessThan(0.75);
  });

  it('mevcut sorular bos ise isDuplicate false', async () => {
    p.writtenQuestion.findMany.mockResolvedValue([]);
    const result = await uc.execute('edu1', 'Yeterince uzun bir soru icerigi var burada');
    expect(result.isDuplicate).toBe(false);
    expect(result.matchedQuestionId).toBeNull();
  });

  it('content null olan kayitlar atlanir', async () => {
    p.writtenQuestion.findMany.mockResolvedValue([
      { id: 'q4', content: null },
      { id: 'q5', content: '' },
    ]);
    const result = await uc.execute('edu1', 'Bu uzun bir soru metnidir test icin');
    expect(result.isDuplicate).toBe(false);
  });

  it('excludeQuestionId gonderildiginde where filtresine eklenir', async () => {
    p.writtenQuestion.findMany.mockResolvedValue([]);
    await uc.execute('edu1', 'Yeterince uzun bir soru icerigi test', 'q-exclude');
    const call = p.writtenQuestion.findMany.mock.calls[0][0];
    expect(call.where.id).toEqual({ not: 'q-exclude' });
  });

  it('excludeQuestionId null ise where filtresinde id yok', async () => {
    p.writtenQuestion.findMany.mockResolvedValue([]);
    await uc.execute('edu1', 'Yeterince uzun bir soru icerigi test', null);
    const call = p.writtenQuestion.findMany.mock.calls[0][0];
    expect(call.where.id).toBeUndefined();
  });

  it('educatorId filtresi dogru uygulanir', async () => {
    p.writtenQuestion.findMany.mockResolvedValue([]);
    await uc.execute('edu-special', 'Yeterince uzun bir soru metni var burada');
    const call = p.writtenQuestion.findMany.mock.calls[0][0];
    expect(call.where.test.educatorId).toBe('edu-special');
    expect(call.where.test.deletedAt).toBeNull();
  });

  it('en yuksek benzerlik donulur (birden fazla soru)', async () => {
    p.writtenQuestion.findMany.mockResolvedValue([
      { id: 'q-low', content: 'tamamen farkli icerik burada bulunmaktadir' },
      { id: 'q-high', content: 'turkiyenin baskenti neresidir aciklayiniz detayli' },
    ]);
    const result = await uc.execute('edu1', 'turkiyenin baskenti neresidir aciklayiniz detayli');
    expect(result.matchedQuestionId).toBe('q-high');
  });

  it('matchedContent 200 karakterle sinirlandirilir', async () => {
    const longContent = 'A'.repeat(300) + ' ortak kelimeler burada var test';
    p.writtenQuestion.findMany.mockResolvedValue([{ id: 'q-long', content: longContent }]);
    // Input exact same to guarantee isDuplicate
    const result = await uc.execute('edu1', longContent);
    expect(result.matchedContent!.length).toBeLessThanOrEqual(200);
  });

  it('similarity 0.999 uzerinde ise erken durur (break)', async () => {
    const content = 'turkiyenin baskenti neresidir aciklayiniz detayli olarak anlatiniz';
    p.writtenQuestion.findMany.mockResolvedValue([
      { id: 'q-exact', content },
      { id: 'q-later', content: 'bu soru kontrol edilmemeli' },
    ]);
    const result = await uc.execute('edu1', content);
    expect(result.isDuplicate).toBe(true);
    expect(result.matchedQuestionId).toBe('q-exact');
  });

  it('MAX_SCAN limiti uygulanir (take)', async () => {
    p.writtenQuestion.findMany.mockResolvedValue([]);
    await uc.execute('edu1', 'Yeterince uzun metin icerigi burada var');
    const call = p.writtenQuestion.findMany.mock.calls[0][0];
    expect(call.take).toBe(2000);
    expect(call.orderBy).toEqual({ createdAt: 'desc' });
  });
});
