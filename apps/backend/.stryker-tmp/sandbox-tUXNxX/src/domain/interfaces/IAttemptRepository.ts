// @ts-nocheck
import { TestAttempt } from '../entities/Exam';

export interface ScoreCount {
  score: number;
  count: number;
}

export interface IAttemptRepository {
  countSubmittedByTest(testId: string): Promise<number>;
  groupScoresByTest(testId: string): Promise<ScoreCount[]>;
  findLatestSubmittedAttempt(testId: string, candidateId: string): Promise<{ id: string; score: number } | null>;
  findAttemptById(attemptId: string): Promise<TestAttempt | null>;
  hasSubmittedAttempt(testId: string, candidateId: string): Promise<boolean>;
  hasAnyAttempt(testId: string, candidateId: string): Promise<boolean>;
  hasAnswersForQuestion(questionId: string): Promise<boolean>;
  hasAnswersForOption(optionId: string): Promise<boolean>;
  markTimeout(attemptId: string, data: { score: number; submittedAt: Date; completedAt: Date }): Promise<TestAttempt>;
}

