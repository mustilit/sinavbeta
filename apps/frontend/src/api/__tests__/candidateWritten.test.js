/**
 * candidateWritten dalClient namespace testleri
 *
 * Kapsam:
 *   - submitAnswer drawingUrl body'ye dahil edilir (regression: eski kod drawingUrl
 *     destructure etmeyip kaybediyordu, kalem cizimi persist etmiyordu)
 *   - start, getState, finish, getSolution, timeout kontrat dogrulamalari
 *   - uploadDrawing FormData akisi
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockApi = {
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
};

vi.mock('@/lib/api/apiClient', () => ({ default: mockApi }));

const { candidateWritten } = await import('../dalClient');

beforeEach(() => {
  Object.values(mockApi).forEach((fn) => fn.mockReset());
});

describe('candidateWritten.submitAnswer', () => {
  it('drawingUrl body icinde gonderilir (regression: kalem cizimi kaybi)', async () => {
    // Arrange
    const attemptId = 'att-123';
    const payload = { questionId: 'q-1', textAnswer: 'Cevap metni', drawingUrl: 'https://uploads/drawing.png' };
    mockApi.post.mockResolvedValue({ data: { ok: true } });

    // Act
    await candidateWritten.submitAnswer(attemptId, payload);

    // Assert — drawingUrl body icinde OLMALI
    expect(mockApi.post).toHaveBeenCalledWith(
      `/candidate-written/attempts/${attemptId}/answer`,
      { questionId: 'q-1', textAnswer: 'Cevap metni', drawingUrl: 'https://uploads/drawing.png' },
    );
  });

  it('drawingUrl null oldugunda null olarak gonderilir', async () => {
    // Arrange
    mockApi.post.mockResolvedValue({ data: { ok: true } });

    // Act
    await candidateWritten.submitAnswer('att-1', { questionId: 'q-2', textAnswer: 'foo', drawingUrl: null });

    // Assert
    expect(mockApi.post).toHaveBeenCalledWith(
      '/candidate-written/attempts/att-1/answer',
      { questionId: 'q-2', textAnswer: 'foo', drawingUrl: null },
    );
  });

  it('drawingUrl undefined oldugunda da body icinde yer alir', async () => {
    // Arrange
    mockApi.post.mockResolvedValue({ data: { ok: true } });

    // Act
    await candidateWritten.submitAnswer('att-1', { questionId: 'q-3', textAnswer: 'bar', drawingUrl: undefined });

    // Assert — destructure { questionId, textAnswer, drawingUrl } ==> drawingUrl: undefined
    expect(mockApi.post).toHaveBeenCalledWith(
      '/candidate-written/attempts/att-1/answer',
      expect.objectContaining({ questionId: 'q-3', textAnswer: 'bar' }),
    );
    // drawingUrl parametresi gonderilmeli (undefined olsa bile key bulunmali)
    const body = mockApi.post.mock.calls[0][1];
    expect('drawingUrl' in body).toBe(true);
  });
});

describe('candidateWritten.start', () => {
  it('POST /candidate-written/tests/:testId/start cagirilir', async () => {
    // Arrange
    mockApi.post.mockResolvedValue({ data: { attemptId: 'att-99', resumed: false } });

    // Act
    const result = await candidateWritten.start('test-abc');

    // Assert
    expect(mockApi.post).toHaveBeenCalledWith('/candidate-written/tests/test-abc/start', {});
    expect(result.attemptId).toBe('att-99');
  });
});

describe('candidateWritten.getState', () => {
  it('GET /candidate-written/attempts/:attemptId/state cagirilir', async () => {
    // Arrange
    const stateData = { attempt: { status: 'IN_PROGRESS' }, questions: [] };
    mockApi.get.mockResolvedValue({ data: stateData });

    // Act
    const result = await candidateWritten.getState('att-55');

    // Assert
    expect(mockApi.get).toHaveBeenCalledWith('/candidate-written/attempts/att-55/state');
    expect(result.attempt.status).toBe('IN_PROGRESS');
  });
});

describe('candidateWritten.finish', () => {
  it('POST /candidate-written/attempts/:attemptId/finish cagirilir', async () => {
    // Arrange
    mockApi.post.mockResolvedValue({ data: { ok: true } });

    // Act
    await candidateWritten.finish('att-77');

    // Assert
    expect(mockApi.post).toHaveBeenCalledWith('/candidate-written/attempts/att-77/finish', {});
  });
});

describe('candidateWritten.getSolution', () => {
  it('GET ile soru cozumu getirilir', async () => {
    // Arrange
    mockApi.get.mockResolvedValue({ data: { solutionText: 'Cozum', solutionMediaUrl: null } });

    // Act
    const result = await candidateWritten.getSolution('att-1', 'q-5');

    // Assert
    expect(mockApi.get).toHaveBeenCalledWith('/candidate-written/attempts/att-1/questions/q-5/solution');
    expect(result.solutionText).toBe('Cozum');
  });
});

describe('candidateWritten.timeout', () => {
  it('POST ile sure asimi teslimi yapilir', async () => {
    // Arrange
    mockApi.post.mockResolvedValue({ data: { ok: true } });

    // Act
    await candidateWritten.timeout('att-88');

    // Assert
    expect(mockApi.post).toHaveBeenCalledWith('/candidate-written/attempts/att-88/timeout', {});
  });
});
