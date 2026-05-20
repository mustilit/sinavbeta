// @ts-nocheck
import { IAttemptAnswerRepository, AttemptAnswerRow } from '../../domain/interfaces/IAttemptAnswerRepository';

export class InMemoryAttemptAnswerRepository implements IAttemptAnswerRepository {
  private rows: AttemptAnswerRow[] = [];
  private optionCorrectness: Record<string, boolean> = {};

  constructor(optionCorrectnessMap?: Record<string, boolean>) {
    if (optionCorrectnessMap) this.optionCorrectness = optionCorrectnessMap;
  }

  async findByAttemptId(attemptId: string): Promise<AttemptAnswerRow[]> {
    return this.rows.filter((r) => (r as any).attemptId === attemptId).map((r) => ({ questionId: r.questionId, selectedOptionId: r.selectedOptionId }));
  }

  async findByAttemptIdWithOptionCorrectness(attemptId: string): Promise<Array<{ questionId: string; selectedOptionId: string | null; isCorrect: boolean | null }>> {
    const filtered = this.rows.filter((r) => (r as any).attemptId === attemptId);
    return filtered.map((r) => {
      const sel = r.selectedOptionId ?? null;
      const isCorrect = sel ? (this.optionCorrectness[sel] === true ? true : (this.optionCorrectness[sel] === false ? false : null)) : null;
      return { questionId: r.questionId, selectedOptionId: sel, isCorrect };
    });
  }

  // helpers
  addRow(attemptId: string, questionId: string, selectedOptionId: string | null) {
    this.rows.push({ questionId, selectedOptionId } as AttemptAnswerRow & { attemptId: string });
    (this.rows[this.rows.length - 1] as any).attemptId = attemptId;
  }
}

