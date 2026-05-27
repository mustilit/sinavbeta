/**
 * TestPublishService unit testleri.
 * PrismaClient ve repository'ler mock'lanır.
 */
import { TestPublishService } from '../../src/application/services/TestPublishService';
import { IExamRepository, ExamWithQuestions } from '../../src/domain/interfaces/IExamRepository';
import { AuditLogService } from '../../src/application/services/AuditLogService';

const makeQuestion = (opts: { id?: string; correctCount?: number } = {}) => {
  const correctCount = opts.correctCount ?? 1;
  const options = [
    { id: 'o-1', questionId: opts.id ?? 'q-1', content: 'A', isCorrect: correctCount >= 1, mediaUrl: null },
    { id: 'o-2', questionId: opts.id ?? 'q-1', content: 'B', isCorrect: false, mediaUrl: null },
  ];
  if (correctCount === 0) options[0].isCorrect = false;
  if (correctCount === 2) options[1].isCorrect = true;
  return {
    id: opts.id ?? 'q-1',
    testId: 'test-1',
    content: 'Question content',
    order: 1,
    mediaUrl: null,
    options,
    solutionText: null,
    solutionMediaUrl: null,
  };
};

const makeTest = (overrides: Partial<ExamWithQuestions> = {}): ExamWithQuestions => ({
  id: 'test-1',
  title: 'Test',
  isTimed: false,
  duration: null,
  status: 'DRAFT',
  educatorId: 'edu-1',
  examTypeId: null,
  topicId: null,
  metadata: {},
  publishedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  questionCount: 5,
  hasSolutions: false,
  priceCents: null,
  packageId: null,
  questions: Array.from({ length: 5 }, (_, i) => makeQuestion({ id: `q-${i + 1}` })),
  ...overrides,
});

describe('TestPublishService', () => {
  let service: TestPublishService;
  let mockExamRepo: jest.Mocked<IExamRepository>;
  let mockAuditService: jest.Mocked<AuditLogService>;
  let mockPrisma: any;

  beforeEach(() => {
    mockExamRepo = {
      findById: jest.fn(),
      save: jest.fn(),
      findAll: jest.fn(),
      findPublished: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    } as any;

    mockAuditService = {
      log: jest.fn(),
      logPurchase: jest.fn(),
      logRefund: jest.fn(),
      logPriceChange: jest.fn(),
      logPublish: jest.fn(),
      logUnpublish: jest.fn(),
    } as any;

    mockPrisma = {
      $transaction: jest.fn(),
      examQuestion: {
        count: jest.fn().mockResolvedValue(0), // Moderasyon: onaylı, 0 bekleyen
      },
    };

    service = new TestPublishService(mockExamRepo, mockAuditService, mockPrisma);
  });

  // --- publish ---

  describe('publish', () => {
    it('5 sorulu test yayınlandığında başarılı döner', async () => {
      // Arrange
      const test = makeTest();
      mockExamRepo.findById.mockResolvedValueOnce(test);
      mockPrisma.examQuestion.count.mockResolvedValueOnce(0); // pendingCount = 0
      const publishedRow = {
        ...test,
        status: 'PUBLISHED',
        publishedAt: new Date(),
        questions: test.questions,
      };
      mockPrisma.$transaction.mockImplementationOnce(async (fn: Function) => {
        return fn({
          examTest: { update: jest.fn().mockResolvedValue(publishedRow) },
          auditLog: { create: jest.fn().mockResolvedValue({}) },
        });
      });

      // Act
      const result = await service.publish('test-1', 'edu-1');

      // Assert
      expect(result.status).toBe('PUBLISHED');
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('test bulunamazsa TEST_NOT_FOUND hatası fırlatır', async () => {
      mockExamRepo.findById.mockResolvedValueOnce(null);
      await expect(service.publish('nonexistent', 'edu-1')).rejects.toThrow('TEST_NOT_FOUND');
    });

    it('5\'ten az soru varsa MIN_QUESTIONS_VIOLATION hatası fırlatır', async () => {
      // Arrange
      const test = makeTest({
        questions: Array.from({ length: 3 }, (_, i) => makeQuestion({ id: `q-${i + 1}` })),
      });
      mockExamRepo.findById.mockResolvedValueOnce(test);

      // Act & Assert
      await expect(service.publish('test-1', 'edu-1')).rejects.toThrow('MIN_QUESTIONS_VIOLATION');
    });

    it('sorulardan birinde doğru şık yoksa ONE_CORRECT_OPTION_VIOLATION hatası fırlatır', async () => {
      // Arrange
      const questions = Array.from({ length: 5 }, (_, i) =>
        i === 2 ? makeQuestion({ id: `q-${i + 1}`, correctCount: 0 }) : makeQuestion({ id: `q-${i + 1}` }),
      );
      const test = makeTest({ questions });
      mockExamRepo.findById.mockResolvedValueOnce(test);

      // Act & Assert
      await expect(service.publish('test-1', 'edu-1')).rejects.toThrow('ONE_CORRECT_OPTION_VIOLATION');
    });

    it('süreli testte duration null ise DURATION_REQUIRED hatası fırlatır', async () => {
      // Arrange
      const test = makeTest({ isTimed: true, duration: null });
      mockExamRepo.findById.mockResolvedValueOnce(test);

      // Act & Assert
      await expect(service.publish('test-1', 'edu-1')).rejects.toThrow('DURATION_REQUIRED');
    });

    it('moderasyon bekleyen sorular varsa hata fırlatır', async () => {
      // Arrange
      const test = makeTest();
      mockExamRepo.findById.mockResolvedValueOnce(test);
      mockPrisma.examQuestion.count.mockResolvedValueOnce(2); // 2 soru bekliyor

      // Act & Assert — AppError mesajı MODERATION_PENDING içerir
      await expect(service.publish('test-1', 'edu-1')).rejects.toMatchObject({
        code: 'MODERATION_PENDING',
      });
    });
  });

  // --- unpublish ---

  describe('unpublish', () => {
    it('test başarıyla yayından kaldırılır', async () => {
      // Arrange
      const test = makeTest({ status: 'PUBLISHED' });
      mockExamRepo.findById.mockResolvedValueOnce(test);
      const unpublishedRow = { ...test, status: 'DRAFT', publishedAt: null };
      mockPrisma.$transaction.mockImplementationOnce(async (fn: Function) => {
        return fn({
          examTest: { update: jest.fn().mockResolvedValue(unpublishedRow) },
          auditLog: { create: jest.fn().mockResolvedValue({}) },
        });
      });

      // Act
      const result = await service.unpublish('test-1', 'admin-1');

      // Assert
      expect(result.status).toBe('DRAFT');
    });

    it('test bulunamazsa TEST_NOT_FOUND hatası fırlatır', async () => {
      mockExamRepo.findById.mockResolvedValueOnce(null);
      await expect(service.unpublish('nonexistent', 'admin-1')).rejects.toThrow('TEST_NOT_FOUND');
    });
  });
});
