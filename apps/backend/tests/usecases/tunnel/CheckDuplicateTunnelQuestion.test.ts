/**
 * CheckDuplicateTunnelQuestionUseCase testleri — tokenize, jaccard ve execute.
 */
jest.mock('../../../src/infrastructure/database/prisma', () => ({
  prisma: {
    tunnelQuestion: { findMany: jest.fn() },
  },
}));

import { CheckDuplicateTunnelQuestionUseCase } from '../../../src/application/use-cases/tunnel/CheckDuplicateTunnelQuestionUseCase';
import { prisma } from '../../../src/infrastructure/database/prisma';

const p = prisma as any;
beforeEach(() => jest.clearAllMocks());

describe('CheckDuplicateTunnelQuestionUseCase', () => {
  const uc = new CheckDuplicateTunnelQuestionUseCase();

  it('educatorId yoksa erken cikar (isDuplicate=false)', async () => {
    const r = await uc.execute('', 'Bu yeterli uzunlukta bir soru metnidir');
    expect(r.isDuplicate).toBe(false);
    expect(p.tunnelQuestion.findMany).not.toHaveBeenCalled();
  });

  it('metin 15 karakterden kisaysa erken cikar', async () => {
    const r = await uc.execute('edu1', 'Kisa metin');
    expect(r.isDuplicate).toBe(false);
    expect(p.tunnelQuestion.findMany).not.toHaveBeenCalled();
  });

  it('icerik bossa erken cikar', async () => {
    const r = await uc.execute('edu1', '');
    expect(r.isDuplicate).toBe(false);
  });

  it('null/undefined icerik → erken cikar', async () => {
    const r = await uc.execute('edu1', null as any);
    expect(r.isDuplicate).toBe(false);
  });

  it('sadece ozel karakter iceren metin → bos token seti → erken cikar', async () => {
    const r = await uc.execute('edu1', '!!! ??? +++ ... ###');
    expect(r.isDuplicate).toBe(false);
    expect(p.tunnelQuestion.findMany).not.toHaveBeenCalled();
  });

  it('birebir eslesmede isDuplicate=true similarity=1.0000', async () => {
    const content = 'Turkiye\'nin baskenti neresidir acaba';
    p.tunnelQuestion.findMany.mockResolvedValue([
      { id: 'q1', content },
    ]);
    const r = await uc.execute('edu1', content);
    expect(r.isDuplicate).toBe(true);
    expect(r.similarity).toBe(1);
    expect(r.matchedQuestionId).toBe('q1');
    expect(r.matchedContent).toBe(content);
  });

  it('yuksek benzerlikte (>=0.75) isDuplicate=true doner', async () => {
    const original = 'Anadolu medeniyetleri arasinda en eski olani hangisidir';
    const similar = 'Anadolu medeniyetleri arasinda en eski olani hangisidir acaba';
    p.tunnelQuestion.findMany.mockResolvedValue([
      { id: 'q10', content: original },
    ]);
    const r = await uc.execute('edu1', similar);
    expect(r.isDuplicate).toBe(true);
    expect(r.similarity).toBeGreaterThanOrEqual(0.75);
  });

  it('dusuk benzerlikte isDuplicate=false doner', async () => {
    p.tunnelQuestion.findMany.mockResolvedValue([
      { id: 'q2', content: 'Kimya periyodik tabloda kacincidir elementler' },
    ]);
    const r = await uc.execute('edu1', 'Turkiye\'nin baskenti neresidir acaba');
    expect(r.isDuplicate).toBe(false);
    expect(r.similarity).toBeLessThan(0.75);
  });

  it('excludeQuestionId verildiginde where kosulunda { id: { not } } gonderilir', async () => {
    p.tunnelQuestion.findMany.mockResolvedValue([]);
    await uc.execute('edu1', 'Yeterince uzun bir soru metni ornegi', 'exclude-id');
    expect(p.tunnelQuestion.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: { not: 'exclude-id' } }) }),
    );
  });

  it('eslesen satirda content bossa atlanir', async () => {
    p.tunnelQuestion.findMany.mockResolvedValue([
      { id: 'q-empty', content: null },
      { id: 'q-real', content: 'Turkiye\'nin baskenti neresidir acaba' },
    ]);
    const r = await uc.execute('edu1', 'Turkiye\'nin baskenti neresidir acaba');
    expect(r.isDuplicate).toBe(true);
    expect(r.matchedQuestionId).toBe('q-real');
  });

  it('eslesen icerik 200 karakterle kesilir', async () => {
    const longContent = 'A'.repeat(300) + ' ' + 'B'.repeat(50);
    p.tunnelQuestion.findMany.mockResolvedValue([
      { id: 'q-long', content: longContent },
    ]);
    // Aynı icerik → birebir eslesiyor
    const r = await uc.execute('edu1', longContent);
    expect(r.matchedContent!.length).toBeLessThanOrEqual(200);
  });

  it('hiç sonuc yoksa isDuplicate=false', async () => {
    p.tunnelQuestion.findMany.mockResolvedValue([]);
    const r = await uc.execute('edu1', 'Tamamen benzersiz bir soru metni burada');
    expect(r.isDuplicate).toBe(false);
    expect(r.matchedQuestionId).toBeNull();
  });

  it('birden fazla satir arasindan en yuksek benzerlik secilir', async () => {
    const target = 'Matematik integral hesaplama yontemleri nelerdir';
    p.tunnelQuestion.findMany.mockResolvedValue([
      { id: 'q-far', content: 'Fizik newton kanunlari nelerdir aciklayin' },
      { id: 'q-near', content: 'Matematik integral hesaplama yontemleri neler' },
    ]);
    const r = await uc.execute('edu1', target);
    expect(r.matchedQuestionId).toBe('q-near');
  });
});
