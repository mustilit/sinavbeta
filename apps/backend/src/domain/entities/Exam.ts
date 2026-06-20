/**
 * Sınav / Test Domain Entities
 */
import { TestStatus, AttemptStatus } from '../types';

export interface ExamTest {
  id: string;
  title: string;
  isTimed: boolean;
  duration: number | null; // dakika
  examTypeId?: string | null;
  gradeLevelId?: string | null;
  topicId?: string | null;
  educatorId?: string | null;
  publishedAt: Date | null;
  status: TestStatus;
  metadata?: Record<string, unknown>;
  price?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ExamQuestion {
  id: string;
  testId: string;
  content: string;
  order: number;
  options?: ExamOption[];
}

export interface ExamOption {
  id: string;
  questionId: string;
  content: string;
  isCorrect: boolean;
}

export interface Candidate {
  id: string;
  name: string;
  email: string;
}

export interface TestAttempt {
  id: string;
  testId: string;
  candidateId: string;
  startedAt: Date;
  completedAt: Date | null;
  status: AttemptStatus;
  score?: number | null;
  submittedAt?: Date | null;
  // Timer engine alanları (optional, backward compatible)
  lastResumedAt?: Date | null;
  pausedAt?: Date | null;
  finishedAt?: Date | null;
  remainingSec?: number | null;
  // Attempt başlangıcındaki soru versiyonu snapshot'ı
  questionsSnapshot?: Array<{
    id: string;
    content: string;
    mediaUrl?: string | null;
    order: number;
    options: Array<{ id: string; content: string; mediaUrl?: string | null; isCorrect: boolean }>;
  }> | null;
  // Periyodik ilerleme kaydı (elapsedSeconds, savedAt vb.)
  metadata?: Record<string, unknown> | null;
}
