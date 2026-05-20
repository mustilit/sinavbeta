// @ts-nocheck
export interface AttemptAnswerRow {
  questionId: string;
  selectedOptionId: string | null;
}

export interface IAttemptAnswerRepository {
  findByAttemptId(attemptId: string): Promise<AttemptAnswerRow[]>;
  findByAttemptIdWithOptionCorrectness(attemptId: string): Promise<Array<{ questionId: string; selectedOptionId: string | null; isCorrect: boolean | null }>>;
}

