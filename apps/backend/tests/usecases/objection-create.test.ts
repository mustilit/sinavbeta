/**
 * CreateObjectionUseCase testleri
 *
 * İş kuralı: Sadece denemeye (attempt) sahip aday itiraz oluşturabilir;
 * aynı soru için aynı denemede yalnızca bir itiraz olabilir;
 * test başına maksimum itiraz limiti vardır.
 */
import { CreateObjectionUseCase } from '../../src/application/use-cases/objection/CreateObjectionUseCase';
import { AppError } from '../../src/application/errors/AppError';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const VALID_UUID_1 = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
const VALID_UUID_2 = 'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22';
const VALID_UUID_3 = 'c2eebc99-9c0b-4ef8-bb6d-6bb9bd380a33';
const ACTOR_ID    = 'd3eebc99-9c0b-4ef8-bb6d-6bb9bd380a44';

function makeAttempt(overrides: Record<string, unknown> = {}) {
  return {
    id: VALID_UUID_1,
    candidateId: ACTOR_ID,
    testId: VALID_UUID_3,
    status: 'SUBMITTED',
    ...overrides,
  };
}

function makeQuestion(overrides: Record<string, unknown> = {}) {
  return {
    id: VALID_UUID_2,
    testId: VALID_UUID_3,
    content: 'Hangi seçenek doğrudur?',
    ...overrides,
  };
}

function makeObjection(overrides: Record<string, unknown> = {}) {
  return {
    id: 'obj-1',
    attemptId: VALID_UUID_1,
    questionId: VALID_UUID_2,
    reporterId: ACTOR_ID,
    reason: 'Bu soru hatalı çünkü cevap belirsiz.',
    createdAt: new Date(),
    ...overrides,
  };
}

function makeRepos(overrides: {
  objectionRepo?: Partial<any>;
  attemptRepo?: Partial<any>;
  examRepo?: Partial<any>;
  auditRepo?: Partial<any>;
} = {}) {
  const objectionRepo = {
    findByAttemptAndQuestion: jest.fn().mockResolvedValue(null),
    countByTestAndCandidate: jest.fn().mockResolvedValue(0),
    create: jest.fn().mockResolvedValue(makeObjection()),
    ...overrides.objectionRepo,
  };
  const attemptRepo = {
    findAttemptById: jest.fn().mockResolvedValue(makeAttempt()),
    ...overrides.attemptRepo,
  };
  const examRepo = {
    findQuestionById: jest.fn().mockResolvedValue(makeQuestion()),
    ...overrides.examRepo,
  };
  const auditRepo = {
    create: jest.fn().mockResolvedValue(null),
    ...overrides.auditRepo,
  };
  return { objectionRepo, attemptRepo, examRepo, auditRepo };
}

function makeUseCase(overrides = {}) {
  const { objectionRepo, attemptRepo, examRepo, auditRepo } = makeRepos(overrides);
  const uc = new CreateObjectionUseCase(
    objectionRepo as any,
    attemptRepo as any,
    examRepo as any,
    auditRepo as any,
  );
  return { uc, objectionRepo, attemptRepo, examRepo, auditRepo };
}

const validInput = {
  attemptId: VALID_UUID_1,
  questionId: VALID_UUID_2,
  reason: 'Bu soru hatalı çünkü cevap belirsiz.',
};

// ---------------------------------------------------------------------------
// Testler
// ---------------------------------------------------------------------------

describe('CreateObjectionUseCase', () => {
  describe('başarılı itiraz oluşturma', () => {
    it('geçerli girdi ile itiraz oluşturulduğunda reporterId actorId ye eşittir', async () => {
      // Arrange
      const { uc } = makeUseCase();

      // Act
      const result = await uc.execute(validInput, ACTOR_ID);

      // Assert
      expect(result.reporterId).toBe(ACTOR_ID);
      expect(result.attemptId).toBe(VALID_UUID_1);
      expect(result.questionId).toBe(VALID_UUID_2);
      expect(result.id).toBeDefined();
    });

    it('geçerli girdi ile itiraz oluşturulduğunda reason trim edilmiş haliyle kaydedilir', async () => {
      // Arrange
      const { uc, objectionRepo } = makeUseCase();
      const inputWithSpaces = { ...validInput, reason: '  Bu soru hatalı.  ' };

      // Act
      await uc.execute(inputWithSpaces, ACTOR_ID);

      // Assert — create metodu trim edilmiş reason ile çağrılmalı
      expect(objectionRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ reason: 'Bu soru hatalı.' }),
      );
    });

    it('itiraz başarıyla oluşturulduğunda auditRepo.create çağrılır', async () => {
      // Arrange
      const { uc, auditRepo } = makeUseCase();

      // Act
      await uc.execute(validInput, ACTOR_ID);

      // Assert
      expect(auditRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'OBJECTION_CREATED' }),
      );
    });
  });

  describe('kimlik doğrulama hataları', () => {
    it('actorId undefined olduğunda UNAUTHORIZED hatası fırlatır', async () => {
      // Arrange
      const { uc } = makeUseCase();

      // Act & Assert
      await expect(uc.execute(validInput, undefined)).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
      });
    });

    it('actorId boş string olduğunda UNAUTHORIZED hatası fırlatır', async () => {
      // Arrange
      const { uc } = makeUseCase();

      // Act & Assert
      await expect(uc.execute(validInput, '')).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
      });
    });
  });

  describe('UUID format doğrulaması', () => {
    it('attemptId geçersiz UUID formatında olduğunda INVALID_UUID hatası fırlatır', async () => {
      // Arrange
      const { uc } = makeUseCase();
      const input = { ...validInput, attemptId: 'not-a-uuid' };

      // Act & Assert
      await expect(uc.execute(input, ACTOR_ID)).rejects.toMatchObject({
        code: 'INVALID_UUID',
      });
    });

    it('questionId geçersiz UUID formatında olduğunda INVALID_UUID hatası fırlatır', async () => {
      // Arrange
      const { uc } = makeUseCase();
      const input = { ...validInput, questionId: '12345-invalid' };

      // Act & Assert
      await expect(uc.execute(input, ACTOR_ID)).rejects.toMatchObject({
        code: 'INVALID_UUID',
      });
    });
  });

  describe('gerekçe validasyonu', () => {
    it('reason 4 karakter olduğunda REASON_TOO_SHORT hatası fırlatır', async () => {
      // Arrange
      const { uc } = makeUseCase();
      const input = { ...validInput, reason: 'kısa' };

      // Act & Assert
      await expect(uc.execute(input, ACTOR_ID)).rejects.toMatchObject({
        code: 'REASON_TOO_SHORT',
      });
    });

    it('reason boş string olduğunda REASON_TOO_SHORT hatası fırlatır', async () => {
      // Arrange
      const { uc } = makeUseCase();
      const input = { ...validInput, reason: '' };

      // Act & Assert
      await expect(uc.execute(input, ACTOR_ID)).rejects.toMatchObject({
        code: 'REASON_TOO_SHORT',
      });
    });

    it('reason sadece boşluklardan oluştuğunda REASON_TOO_SHORT hatası fırlatır', async () => {
      // Arrange
      const { uc } = makeUseCase();
      const input = { ...validInput, reason: '     ' };

      // Act & Assert
      await expect(uc.execute(input, ACTOR_ID)).rejects.toMatchObject({
        code: 'REASON_TOO_SHORT',
      });
    });
  });

  describe('deneme bulunamadı', () => {
    it('attemptId geçerli UUID ancak deneme bulunamıyorsa ATTEMPT_NOT_FOUND hatası fırlatır', async () => {
      // Arrange
      const { uc } = makeUseCase({
        attemptRepo: { findAttemptById: jest.fn().mockResolvedValue(null) },
      });

      // Act & Assert
      await expect(uc.execute(validInput, ACTOR_ID)).rejects.toMatchObject({
        code: 'ATTEMPT_NOT_FOUND',
      });
    });
  });

  describe('sahiplik kontrolü', () => {
    it('deneme farklı bir adaya aitse FORBIDDEN_NOT_OWNER hatası fırlatır', async () => {
      // Arrange
      const { uc } = makeUseCase({
        attemptRepo: {
          findAttemptById: jest.fn().mockResolvedValue(
            makeAttempt({ candidateId: 'farkli-aday-uuid' }),
          ),
        },
      });

      // Act & Assert
      await expect(uc.execute(validInput, ACTOR_ID)).rejects.toMatchObject({
        code: 'FORBIDDEN_NOT_OWNER',
      });
    });
  });

  describe('soru doğrulaması', () => {
    it('questionId geçerli UUID ancak soru bulunamıyorsa QUESTION_NOT_FOUND hatası fırlatır', async () => {
      // Arrange
      const { uc } = makeUseCase({
        examRepo: { findQuestionById: jest.fn().mockResolvedValue(null) },
      });

      // Act & Assert
      await expect(uc.execute(validInput, ACTOR_ID)).rejects.toMatchObject({
        code: 'QUESTION_NOT_FOUND',
      });
    });

    it('soru farklı bir teste ait olduğunda QUESTION_NOT_IN_TEST hatası fırlatır', async () => {
      // Arrange
      const { uc } = makeUseCase({
        examRepo: {
          findQuestionById: jest.fn().mockResolvedValue(
            makeQuestion({ testId: 'farkli-test-uuid' }),
          ),
        },
      });

      // Act & Assert
      await expect(uc.execute(validInput, ACTOR_ID)).rejects.toMatchObject({
        code: 'QUESTION_NOT_IN_TEST',
      });
    });
  });

  describe('tekrarlı itiraz kontrolü', () => {
    it('aynı deneme ve soru için itiraz zaten varsa OBJECTION_ALREADY_EXISTS hatası fırlatır', async () => {
      // Arrange
      const { uc } = makeUseCase({
        objectionRepo: {
          findByAttemptAndQuestion: jest.fn().mockResolvedValue(makeObjection()),
          countByTestAndCandidate: jest.fn().mockResolvedValue(0),
          create: jest.fn(),
        },
      });

      // Act & Assert
      await expect(uc.execute(validInput, ACTOR_ID)).rejects.toMatchObject({
        code: 'OBJECTION_ALREADY_EXISTS',
      });
    });
  });

  describe('itiraz limiti', () => {
    it('test başına itiraz limiti aşıldığında OBJECTION_LIMIT_EXCEEDED hatası fırlatır', async () => {
      // Arrange — limit (20) kadar itiraz zaten mevcut
      const { uc } = makeUseCase({
        objectionRepo: {
          findByAttemptAndQuestion: jest.fn().mockResolvedValue(null),
          countByTestAndCandidate: jest.fn().mockResolvedValue(20),
          create: jest.fn(),
        },
      });

      // Act & Assert
      await expect(uc.execute(validInput, ACTOR_ID)).rejects.toMatchObject({
        code: 'OBJECTION_LIMIT_EXCEEDED',
      });
    });

    it('limit altında itiraz sayısında hata fırlatılmaz', async () => {
      // Arrange
      const { uc } = makeUseCase({
        objectionRepo: {
          findByAttemptAndQuestion: jest.fn().mockResolvedValue(null),
          countByTestAndCandidate: jest.fn().mockResolvedValue(19),
          create: jest.fn().mockResolvedValue(makeObjection()),
        },
      });

      // Act & Assert
      await expect(uc.execute(validInput, ACTOR_ID)).resolves.toBeDefined();
    });
  });
});
