// @ts-nocheck
import { Objection, CreateObjectionInput, ObjectionWithTestOwner } from '../entities/Objection';

export interface EnrichedObjection {
  id: string;
  reason: string;
  status: string;
  createdAt: Date;
  answerText?: string;
  answeredAt?: Date;
  escalatedAt?: Date;
  deadlineAt: Date;
  questionId: string;
  questionContent: string;
  testId: string;
  testTitle: string;
  reporterId: string;
  reporterName: string;
  educatorId?: string | null;
  educatorName?: string | null;
}

export interface TestReportStat {
  testId: string;
  testTitle: string;
  educatorId: string | null;
  educatorName: string | null;
  totalCount: number;
  openCount: number;
  answeredCount: number;
  escalatedCount: number;
}

export interface IObjectionRepository {
  create(input: CreateObjectionInput): Promise<Objection>;
  findByAttemptAndQuestion(attemptId: string, questionId: string): Promise<Objection | null>;
  findByIdWithTestOwner(objectionId: string): Promise<ObjectionWithTestOwner | null>;
  updateAnswer(objectionId: string, data: { answerText: string; answeredAt: Date; status: 'ANSWERED' }): Promise<Objection | null>;
  escalate(objectionId: string, data: { status: 'ESCALATED'; escalatedAt: Date }): Promise<Objection | null>;
  listEscalated(filters?: { from?: Date; to?: Date }): Promise<Objection[]>;
  listByEducator(educatorId: string, filters?: { status?: string }): Promise<EnrichedObjection[]>;
  listAll(filters?: { status?: string; from?: Date; to?: Date }): Promise<EnrichedObjection[]>;
  listTestReportStats(): Promise<TestReportStat[]>;
  countByTestAndCandidate(testId: string, candidateId: string): Promise<number>;
  findOverdueOpenObjections(olderThanDays: number, limit?: number): Promise<Objection[]>;
  markEscalated(objectionIds: string[]): Promise<number>;
}
