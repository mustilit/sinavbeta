// @ts-nocheck
import type { ObjectionStatus } from '../types';

/**
 * Objection entity (candidate objects to a question in their attempt).
 */
export interface Objection {
  id: string;
  attemptId: string;
  questionId: string;
  reporterId: string;
  reason: string;
  status: ObjectionStatus;
  answerText?: string | null;
  createdAt: Date;
  answeredAt?: Date | null;
  escalatedAt?: Date | null;
}

/** For ownership check: objection + test educatorId (from attempt.test) */
export interface ObjectionWithTestOwner {
  objection: Objection;
  educatorId: string | null;
}

export interface CreateObjectionInput {
  attemptId: string;
  questionId: string;
  reporterId: string;
  reason: string;
}
