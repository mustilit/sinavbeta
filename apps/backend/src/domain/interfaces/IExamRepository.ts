import { ExamTest, ExamQuestion, ExamOption } from '../entities/Exam';

export interface ExamWithQuestions extends ExamTest {
  questions: (ExamQuestion & { options: ExamOption[] })[];
  /** Türetilebilir: questions.length veya repo _count/include */
  questionCount?: number;
  hasSolutions?: boolean;
  packageId?: string | null;
  priceCents?: number | null;
}

export interface IExamRepository {
  findById(id: string): Promise<ExamWithQuestions | null>;
  save(test: ExamTest, questions: (ExamQuestion & { options: ExamOption[] })[]): Promise<ExamWithQuestions>;
  publish(id: string): Promise<ExamWithQuestions | null>;
  unpublish(id: string): Promise<ExamWithQuestions | null>;
  findAll(): Promise<ExamWithQuestions[]>;
  findPublished(filters?: {
    examTypeId?: string;
    topicId?: string;
    educatorId?: string;
    isTimed?: boolean;
    minPriceCents?: number;
    maxPriceCents?: number;
    minRating?: number;
    page?: number;
    limit?: number;
    sortBy?: 'publishedAt' | 'priceCents' | 'createdAt';
    order?: 'asc' | 'desc';
  }): Promise<{ items: ExamWithQuestions[]; total: number }>;
  addQuestion(testId: string, question: ExamQuestion & { options: ExamOption[] }): Promise<ExamWithQuestions>;
  updateQuestion(questionId: string, updates: Partial<ExamQuestion & { options?: ExamOption[]; mediaUrl?: string | null; solutionText?: string | null; solutionMediaUrl?: string | null }>): Promise<ExamQuestion | null>;
  listPublishedByFollowed(opts: { educatorIds?: string[]; examTypeIds?: string[]; limit: number; examTypeId?: string | null }): Promise<ExamWithQuestions[]>;
  listPublishedFallback(opts: { excludeIds?: string[]; limit: number; examTypeId?: string | null }): Promise<ExamWithQuestions[]>;
  listPublishedByEducator(opts: { educatorId: string; examTypeId?: string | null; page?: number; limit?: number; sortBy?: 'publishedAt' | 'price' | 'createdAt'; order?: 'asc' | 'desc' }): Promise<{ items: ExamWithQuestions[]; total: number }>;
  findByEducatorId(educatorId: string): Promise<ExamWithQuestions[]>;
  findCorrectOptionIdsByQuestionIds(questionIds: string[]): Promise<Record<string, string[]>>;
  findQuestionById(questionId: string): Promise<{ id: string; testId: string } | null>;
  findOptionById(optionId: string): Promise<{ id: string; questionId: string; testId: string } | null>;
  updateOption(optionId: string, updates: { content?: string; isCorrect?: boolean }): Promise<ExamOption | null>;
  updateTestMetadata(
    testId: string,
    updates: {
      title?: string;
      priceCents?: number;
      duration?: number;
      isTimed?: boolean;
      hasSolutions?: boolean;
      campaignPriceCents?: number | null;
      campaignValidFrom?: Date | null;
      campaignValidUntil?: Date | null;
      coverImageUrl?: string | null;
    },
  ): Promise<ExamWithQuestions | null>;
}
