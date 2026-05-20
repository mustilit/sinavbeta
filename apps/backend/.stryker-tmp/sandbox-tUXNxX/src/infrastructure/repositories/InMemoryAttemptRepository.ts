// @ts-nocheck
import { TestAttempt } from '../../domain/entities/Exam';
import { IAttemptRepository, ScoreCount } from '../../domain/interfaces/IAttemptRepository';

export class InMemoryAttemptRepository implements IAttemptRepository {
  private attempts: Map<string, TestAttempt> = new Map();

  async countSubmittedByTest(testId: string): Promise<number> {
    let c = 0;
    for (const a of this.attempts.values()) {
      if (a.testId === testId && a.status === 'SUBMITTED') c++;
    }
    return c;
  }

  async groupScoresByTest(testId: string): Promise<ScoreCount[]> {
    const map = new Map<number, number>();
    for (const a of this.attempts.values()) {
      if (a.testId === testId && a.status === 'SUBMITTED' && typeof a.score === 'number') {
        const s = Math.floor(a.score as number);
        map.set(s, (map.get(s) ?? 0) + 1);
      }
    }
    return Array.from(map.entries()).map(([score, count]) => ({ score, count }));
  }

  async findLatestSubmittedAttempt(testId: string, candidateId: string): Promise<{ id: string; score: number } | null> {
    // find latest by completedAt
    let best: TestAttempt | null = null;
    for (const a of this.attempts.values()) {
      if (a.testId === testId && a.candidateId === candidateId && a.status === 'SUBMITTED') {
        if (!best || (a.completedAt && best.completedAt && a.completedAt > best.completedAt)) best = a;
      }
    }
    if (!best) return null;
    return { id: best.id, score: best.score ?? 0 };
  }

  async findAttemptById(attemptId: string): Promise<TestAttempt | null> {
    return this.attempts.get(attemptId) ?? null;
  }

  async hasSubmittedAttempt(testId: string, candidateId: string): Promise<boolean> {
    for (const a of this.attempts.values()) {
      if (a.testId === testId && a.candidateId === candidateId && a.status === 'SUBMITTED') return true;
    }
    return false;
  }

  async hasAnyAttempt(testId: string, candidateId: string): Promise<boolean> {
    for (const a of this.attempts.values()) {
      if (a.testId === testId && a.candidateId === candidateId) return true;
    }
    return false;
  }

  async hasAnswersForQuestion(_questionId: string): Promise<boolean> {
    return false;
  }

  async hasAnswersForOption(_optionId: string): Promise<boolean> {
    return false;
  }

  async markTimeout(attemptId: string, data: { score: number; submittedAt: Date; completedAt: Date }): Promise<TestAttempt> {
    const existing = this.attempts.get(attemptId);
    if (!existing) throw new Error('ATTEMPT_NOT_FOUND');
    const updated: TestAttempt = {
      ...existing,
      status: 'TIMEOUT',
      score: data.score,
      submittedAt: data.submittedAt,
      completedAt: data.completedAt,
    };
    this.attempts.set(attemptId, updated);
    return updated;
  }

  // helpers for tests
  create(attempt: TestAttempt) {
    this.attempts.set(attempt.id, attempt);
    return attempt;
  }
}

