/**
 * tunnelPlay.ts dogrudan testleri: loadPlayData, loadMasks, buildAttemptState.
 * Bu dosya tunnelPlay'i mock'LAMAZ, gercek fonksiyonlari test eder — yalnizca
 * prisma mock'lanir.
 */
jest.mock('../../../src/infrastructure/database/prisma', () => ({
  prisma: {
    tunnel: { findUnique: jest.fn() },
    tunnelQuestionProgress: { findMany: jest.fn() },
  },
}));

import { loadPlayData, loadMasks, buildAttemptState, PlayData } from '../../../src/application/use-cases/tunnel/tunnelPlay';
import { prisma } from '../../../src/infrastructure/database/prisma';

const p = prisma as any;
beforeEach(() => jest.clearAllMocks());

/* ────────────────────────────── loadPlayData ────────────────────────────── */
describe('loadPlayData', () => {
  it('tunel bulunamazsa TUNNEL_NOT_FOUND firlattir', async () => {
    p.tunnel.findUnique.mockResolvedValue(null);
    await expect(loadPlayData('tn-none')).rejects.toMatchObject({ code: 'TUNNEL_NOT_FOUND' });
  });

  it('katman+soru+secenek dogru haritalanir (questions + qmeta)', async () => {
    p.tunnel.findUnique.mockResolvedValue({
      id: 'tn1',
      title: 'Test Tunel',
      optionsPerQuestion: 5,
      advanceStreak: 3,
      layerCount: 2,
      status: 'PUBLISHED',
      layers: [
        {
          index: 1,
          questions: [
            {
              id: 'q1',
              content: 'Soru 1',
              mediaUrl: null,
              order: 1,
              options: [
                { id: 'o1', content: 'A', mediaUrl: null, isCorrect: true, order: 1 },
                { id: 'o2', content: 'B', mediaUrl: null, isCorrect: false, order: 2 },
                { id: 'o3', content: 'C', mediaUrl: null, isCorrect: false, order: 3 },
              ],
            },
          ],
        },
        {
          index: 2,
          questions: [
            {
              id: 'q2',
              content: 'Soru 2',
              mediaUrl: 'img.png',
              order: 1,
              options: [
                { id: 'o4', content: 'X', mediaUrl: 'x.png', isCorrect: false, order: 1 },
                { id: 'o5', content: 'Y', mediaUrl: null, isCorrect: true, order: 2 },
              ],
            },
          ],
        },
      ],
    });

    const result = await loadPlayData('tn1');
    // tunnel meta
    expect(result.tunnel).toEqual({
      id: 'tn1',
      title: 'Test Tunel',
      optionsPerQuestion: 5,
      advanceStreak: 3,
      layerCount: 2,
      status: 'PUBLISHED',
    });
    // engine questions
    expect(result.questions).toHaveLength(2);
    expect(result.questions[0]).toEqual({
      id: 'q1',
      layerIndex: 1,
      optionIds: ['o1', 'o2', 'o3'],
      correctOptionId: 'o1',
    });
    expect(result.questions[1]).toEqual({
      id: 'q2',
      layerIndex: 2,
      optionIds: ['o4', 'o5'],
      correctOptionId: 'o5',
    });
    // qmeta
    expect(result.qmeta.size).toBe(2);
    const meta1 = result.qmeta.get('q1');
    expect(meta1?.content).toBe('Soru 1');
    expect(meta1?.mediaUrl).toBeNull();
    expect(meta1?.options).toHaveLength(3);
    const meta2 = result.qmeta.get('q2');
    expect(meta2?.mediaUrl).toBe('img.png');
    expect(meta2?.options[0].mediaUrl).toBe('x.png');
  });

  it('correct isaretsiz soruda ilk secenek fallback olur', async () => {
    p.tunnel.findUnique.mockResolvedValue({
      id: 'tn1',
      title: 'T',
      optionsPerQuestion: 2,
      advanceStreak: 3,
      layerCount: 1,
      status: 'PUBLISHED',
      layers: [
        {
          index: 1,
          questions: [
            {
              id: 'q1',
              content: 'Q',
              mediaUrl: null,
              order: 1,
              options: [
                { id: 'oA', content: 'A', mediaUrl: null, isCorrect: false, order: 1 },
                { id: 'oB', content: 'B', mediaUrl: null, isCorrect: false, order: 2 },
              ],
            },
          ],
        },
      ],
    });
    const result = await loadPlayData('tn1');
    // No correct option → fallback to first
    expect(result.questions[0].correctOptionId).toBe('oA');
  });
});

/* ────────────────────────────── loadMasks ────────────────────────────── */
describe('loadMasks', () => {
  it('progress satirlari Map olarak doner', async () => {
    p.tunnelQuestionProgress.findMany.mockResolvedValue([
      { questionId: 'q1', correctMask: 0b101 },
      { questionId: 'q2', correctMask: 0b011 },
    ]);
    const result = await loadMasks('at1');
    expect(result.size).toBe(2);
    expect(result.get('q1')).toBe(0b101);
    expect(result.get('q2')).toBe(0b011);
    expect(p.tunnelQuestionProgress.findMany).toHaveBeenCalledWith({
      where: { attemptId: 'at1' },
      select: { questionId: true, correctMask: true },
    });
  });

  it('bos attempt icin bos Map doner', async () => {
    p.tunnelQuestionProgress.findMany.mockResolvedValue([]);
    const result = await loadMasks('at-empty');
    expect(result.size).toBe(0);
  });
});

/* ────────────────────────────── buildAttemptState ────────────────────────────── */
describe('buildAttemptState', () => {
  const mkPlay = (qs: { id: string; mask: number }[]): PlayData => {
    const questions = qs.map((q) => ({
      id: q.id,
      layerIndex: 1,
      optionIds: ['o1', 'o2', 'o3'],
      correctOptionId: 'o1',
    }));
    const qmeta = new Map(
      qs.map((q) => [
        q.id,
        {
          id: q.id,
          layerIndex: 1,
          content: `Content ${q.id}`,
          mediaUrl: null,
          options: [
            { id: 'o1', content: 'A', mediaUrl: null },
            { id: 'o2', content: 'B', mediaUrl: null },
            { id: 'o3', content: 'C', mediaUrl: null },
          ],
        },
      ]),
    );
    return {
      tunnel: { id: 'tn1', title: 'Tunel', optionsPerQuestion: 3, advanceStreak: 3, layerCount: 1, status: 'PUBLISHED' },
      questions,
      qmeta,
    };
  };

  it('ilerlem yuzdesini dogru hesaplar', () => {
    const play = mkPlay([
      { id: 'q1', mask: 0b111 }, // mastered (3 bit)
      { id: 'q2', mask: 0b001 }, // not mastered
    ]);
    const masks = new Map([
      ['q1', 0b111],
      ['q2', 0b001],
    ]);
    const attempt = { id: 'at1', status: 'IN_PROGRESS', currentQuestionId: null, currentOrderJson: null };
    const state = buildAttemptState(attempt, play, masks);
    expect(state.totalQuestions).toBe(2);
    expect(state.masteredQuestions).toBe(1);
    expect(state.progressPercent).toBe(50);
    expect(state.currentQuestion).toBeNull();
  });

  it('soru yoksa ilerleme %0', () => {
    const play: PlayData = {
      tunnel: { id: 'tn1', title: 'T', optionsPerQuestion: 3, advanceStreak: 3, layerCount: 1, status: 'PUBLISHED' },
      questions: [],
      qmeta: new Map(),
    };
    const state = buildAttemptState({ id: 'at1', status: 'IN_PROGRESS' }, play, new Map());
    expect(state.totalQuestions).toBe(0);
    expect(state.progressPercent).toBe(0);
  });

  it('currentQuestion sunumunu OrderJson sirasinda olusturur', () => {
    const play = mkPlay([{ id: 'q1', mask: 0 }]);
    const masks = new Map<string, number>();
    const attempt = {
      id: 'at1',
      status: 'IN_PROGRESS',
      currentQuestionId: 'q1',
      currentOrderJson: JSON.stringify(['o3', 'o1', 'o2']),
    };
    const state = buildAttemptState(attempt, play, masks);
    expect(state.currentQuestion).not.toBeNull();
    expect(state.currentQuestion.id).toBe('q1');
    expect(state.currentQuestion.options.map((o: any) => o.id)).toEqual(['o3', 'o1', 'o2']);
    expect(state.currentQuestion.content).toBe('Content q1');
  });

  it('gecersiz OrderJson ile fallback sira kullanilir', () => {
    const play = mkPlay([{ id: 'q1', mask: 0 }]);
    const masks = new Map<string, number>();
    const attempt = {
      id: 'at1',
      status: 'IN_PROGRESS',
      currentQuestionId: 'q1',
      currentOrderJson: 'INVALID_JSON',
    };
    const state = buildAttemptState(attempt, play, masks);
    expect(state.currentQuestion).not.toBeNull();
    expect(state.currentQuestion.options.map((o: any) => o.id)).toEqual(['o1', 'o2', 'o3']);
  });

  it('qmeta bulunamazsa currentQuestion null kalir', () => {
    const play = mkPlay([{ id: 'q1', mask: 0 }]);
    const masks = new Map<string, number>();
    const attempt = {
      id: 'at1',
      status: 'IN_PROGRESS',
      currentQuestionId: 'q-unknown',
      currentOrderJson: JSON.stringify(['o1']),
    };
    const state = buildAttemptState(attempt, play, masks);
    expect(state.currentQuestion).toBeNull();
  });

  it('secenekte mediaUrl null ise null olarak basilir', () => {
    const play = mkPlay([{ id: 'q1', mask: 0 }]);
    // override one option to have mediaUrl
    play.qmeta.get('q1')!.options[0].mediaUrl = 'img.png';
    const masks = new Map<string, number>();
    const attempt = {
      id: 'at1',
      status: 'IN_PROGRESS',
      currentQuestionId: 'q1',
      currentOrderJson: JSON.stringify(['o1', 'o2', 'o3']),
    };
    const state = buildAttemptState(attempt, play, masks);
    expect(state.currentQuestion.options[0].mediaUrl).toBe('img.png');
    expect(state.currentQuestion.options[1].mediaUrl).toBeNull();
  });

  it('orderdaki bilinmeyen optionId icin bos icerik doner', () => {
    const play = mkPlay([{ id: 'q1', mask: 0 }]);
    const masks = new Map<string, number>();
    const attempt = {
      id: 'at1',
      status: 'IN_PROGRESS',
      currentQuestionId: 'q1',
      currentOrderJson: JSON.stringify(['o-unknown', 'o1']),
    };
    const state = buildAttemptState(attempt, play, masks);
    expect(state.currentQuestion.options[0]).toEqual({ id: 'o-unknown', content: '', mediaUrl: null });
  });
});
