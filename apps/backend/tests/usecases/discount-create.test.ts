/**
 * CreateDiscountCodeUseCase testleri
 *
 * FR-E-09: Eğitici limitli kullanım indirim kodu oluşturur.
 * - Kod büyük harfe çevrilir ve en az 3 karakter olmalı.
 * - percentOff: 1-50 arası.
 * - maxUses: null veya >= 1.
 * - validUntil validFrom'dan sonra olmalı.
 * - Kod tüm eğiticiler arasında benzersiz olmalı.
 */
import { BadRequestException } from '@nestjs/common';
import { CreateDiscountCodeUseCase } from '../../src/application/use-cases/discount/CreateDiscountCodeUseCase';
import { AppError } from '../../src/application/errors/AppError';

// ---------------------------------------------------------------------------
// Prisma mock (discountCode doğrudan kullanılıyor)
// ---------------------------------------------------------------------------
jest.mock('../../src/infrastructure/database/prisma', () => ({
  prisma: {
    discountCode: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
  },
}));

import { prisma } from '../../src/infrastructure/database/prisma';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 'edu-1',
    role: 'EDUCATOR',
    status: 'ACTIVE',
    ...overrides,
  };
}

function makeInput(overrides: Record<string, unknown> = {}) {
  return {
    code: 'SAVE10',
    percentOff: 10,
    maxUses: null,
    validFrom: null,
    validUntil: null,
    description: null,
    ...overrides,
  };
}

function makeCreatedCode(overrides: Record<string, unknown> = {}) {
  return {
    id: 'code-1',
    code: 'SAVE10',
    percentOff: 10,
    maxUses: null,
    usedCount: 0,
    isActive: true,
    validFrom: null,
    validUntil: null,
    description: null,
    createdAt: new Date('2026-05-18'),
    createdById: 'edu-1',
    ...overrides,
  };
}

function makeUserRepo(user: ReturnType<typeof makeUser> | null = makeUser()) {
  return { findById: jest.fn(async () => user) };
}

function makeAuditRepo() {
  return { create: jest.fn(async () => ({})) };
}

// ---------------------------------------------------------------------------
// Testler
// ---------------------------------------------------------------------------

describe('CreateDiscountCodeUseCase', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Happy path
  // -------------------------------------------------------------------------
  describe('başarılı kod oluşturma', () => {
    it('geçerli EDUCATOR kodu oluşturduğunda kod büyük harfe çevrilerek kaydedilir', async () => {
      // Arrange
      const userRepo = makeUserRepo();
      const auditRepo = makeAuditRepo();
      const created = makeCreatedCode({ code: 'SAVE10' });
      (prisma.discountCode.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.discountCode.create as jest.Mock).mockResolvedValue(created);

      const uc = new CreateDiscountCodeUseCase(userRepo as any, auditRepo as any);

      // Act
      const result = await uc.execute('edu-1', makeInput({ code: 'save10' }));

      // Assert
      expect(result.code).toBe('SAVE10');
      expect(prisma.discountCode.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ code: 'SAVE10' }) }),
      );
    });

    it('dönen nesne beklenen alanları içerir', async () => {
      // Arrange
      const userRepo = makeUserRepo();
      const auditRepo = makeAuditRepo();
      const created = makeCreatedCode();
      (prisma.discountCode.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.discountCode.create as jest.Mock).mockResolvedValue(created);

      const uc = new CreateDiscountCodeUseCase(userRepo as any, auditRepo as any);

      // Act
      const result = await uc.execute('edu-1', makeInput());

      // Assert
      expect(result).toMatchObject({
        id: 'code-1',
        code: 'SAVE10',
        percentOff: 10,
        maxUses: null,
        usedCount: 0,
        isActive: true,
      });
    });

    it('code trim edilip büyük harfe çevrilmiş haliyle uniqueness kontrolü yapılır', async () => {
      // Arrange
      const userRepo = makeUserRepo();
      const auditRepo = makeAuditRepo();
      const created = makeCreatedCode({ code: 'TRIM10' });
      (prisma.discountCode.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.discountCode.create as jest.Mock).mockResolvedValue(created);

      const uc = new CreateDiscountCodeUseCase(userRepo as any, auditRepo as any);

      // Act
      await uc.execute('edu-1', makeInput({ code: '  trim10  ' }));

      // Assert — findUnique normalize edilmiş kodla çağrılmalı
      expect(prisma.discountCode.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { code: 'TRIM10' } }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // Kullanıcı doğrulama hataları
  // -------------------------------------------------------------------------
  describe('kullanıcı doğrulama hataları', () => {
    it('kullanıcı bulunamazsa USER_NOT_FOUND hatası fırlatır', async () => {
      // Arrange
      const userRepo = makeUserRepo(null);
      const auditRepo = makeAuditRepo();
      const uc = new CreateDiscountCodeUseCase(userRepo as any, auditRepo as any);

      // Act & Assert
      await expect(uc.execute('nonexistent', makeInput())).rejects.toMatchObject({
        code: 'USER_NOT_FOUND',
      });
    });

    it('EDUCATOR rolü olmayan kullanıcı için USER_NOT_EDUCATOR hatası fırlatır', async () => {
      // Arrange
      const userRepo = makeUserRepo(makeUser({ role: 'CANDIDATE' }));
      const auditRepo = makeAuditRepo();
      const uc = new CreateDiscountCodeUseCase(userRepo as any, auditRepo as any);

      // Act & Assert
      await expect(uc.execute('edu-1', makeInput())).rejects.toMatchObject({
        code: 'USER_NOT_EDUCATOR',
      });
    });

    it('SUSPENDED eğitici kod oluşturamaz — EDUCATOR_SUSPENDED hatası', async () => {
      // Arrange
      const userRepo = makeUserRepo(makeUser({ status: 'SUSPENDED' }));
      const auditRepo = makeAuditRepo();
      const uc = new CreateDiscountCodeUseCase(userRepo as any, auditRepo as any);

      // Act & Assert
      await expect(uc.execute('edu-1', makeInput())).rejects.toMatchObject({
        code: 'EDUCATOR_SUSPENDED',
      });
    });
  });

  // -------------------------------------------------------------------------
  // Kod validasyon hataları
  // -------------------------------------------------------------------------
  describe('kod validasyon hataları', () => {
    it('2 karakterlik kod (< 3) için INVALID_CODE BadRequestException fırlatır', async () => {
      // Arrange
      const userRepo = makeUserRepo();
      const auditRepo = makeAuditRepo();
      const uc = new CreateDiscountCodeUseCase(userRepo as any, auditRepo as any);

      // Act & Assert
      await expect(uc.execute('edu-1', makeInput({ code: 'AB' }))).rejects.toBeInstanceOf(BadRequestException);
    });

    it('2 karakterlik kod INVALID_CODE kodu içerir', async () => {
      // Arrange
      const userRepo = makeUserRepo();
      const auditRepo = makeAuditRepo();
      const uc = new CreateDiscountCodeUseCase(userRepo as any, auditRepo as any);

      // Act & Assert
      await expect(uc.execute('edu-1', makeInput({ code: 'AB' }))).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'INVALID_CODE' }),
      });
    });

    it('boş string kod için INVALID_CODE hatası fırlatır', async () => {
      // Arrange
      const userRepo = makeUserRepo();
      const auditRepo = makeAuditRepo();
      const uc = new CreateDiscountCodeUseCase(userRepo as any, auditRepo as any);

      // Act & Assert
      await expect(uc.execute('edu-1', makeInput({ code: '   ' }))).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'INVALID_CODE' }),
      });
    });
  });

  // -------------------------------------------------------------------------
  // percentOff validasyon hataları
  // -------------------------------------------------------------------------
  describe('percentOff validasyon hataları', () => {
    it('percentOff = 0 için INVALID_PERCENT hatası fırlatır', async () => {
      // Arrange
      const userRepo = makeUserRepo();
      const auditRepo = makeAuditRepo();
      const uc = new CreateDiscountCodeUseCase(userRepo as any, auditRepo as any);

      // Act & Assert
      await expect(uc.execute('edu-1', makeInput({ percentOff: 0 }))).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'INVALID_PERCENT' }),
      });
    });

    it('percentOff = 51 için INVALID_PERCENT hatası fırlatır', async () => {
      // Arrange
      const userRepo = makeUserRepo();
      const auditRepo = makeAuditRepo();
      const uc = new CreateDiscountCodeUseCase(userRepo as any, auditRepo as any);

      // Act & Assert
      await expect(uc.execute('edu-1', makeInput({ percentOff: 51 }))).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'INVALID_PERCENT' }),
      });
    });

    it('percentOff = 50 (sınır değer) geçerlidir', async () => {
      // Arrange
      const userRepo = makeUserRepo();
      const auditRepo = makeAuditRepo();
      const created = makeCreatedCode({ percentOff: 50 });
      (prisma.discountCode.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.discountCode.create as jest.Mock).mockResolvedValue(created);

      const uc = new CreateDiscountCodeUseCase(userRepo as any, auditRepo as any);

      // Act & Assert — hata fırlatmamalı
      await expect(uc.execute('edu-1', makeInput({ percentOff: 50 }))).resolves.toBeDefined();
    });

    it('percentOff = 1 (alt sınır) geçerlidir', async () => {
      // Arrange
      const userRepo = makeUserRepo();
      const auditRepo = makeAuditRepo();
      const created = makeCreatedCode({ percentOff: 1 });
      (prisma.discountCode.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.discountCode.create as jest.Mock).mockResolvedValue(created);

      const uc = new CreateDiscountCodeUseCase(userRepo as any, auditRepo as any);

      // Act & Assert
      await expect(uc.execute('edu-1', makeInput({ percentOff: 1 }))).resolves.toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // maxUses validasyon hataları
  // -------------------------------------------------------------------------
  describe('maxUses validasyon hataları', () => {
    it('maxUses = 0 için INVALID_MAX_USES hatası fırlatır', async () => {
      // Arrange
      const userRepo = makeUserRepo();
      const auditRepo = makeAuditRepo();
      const uc = new CreateDiscountCodeUseCase(userRepo as any, auditRepo as any);

      // Act & Assert
      await expect(uc.execute('edu-1', makeInput({ maxUses: 0 }))).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'INVALID_MAX_USES' }),
      });
    });

    it('maxUses = null geçerlidir (sınırsız kullanım)', async () => {
      // Arrange
      const userRepo = makeUserRepo();
      const auditRepo = makeAuditRepo();
      const created = makeCreatedCode({ maxUses: null });
      (prisma.discountCode.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.discountCode.create as jest.Mock).mockResolvedValue(created);

      const uc = new CreateDiscountCodeUseCase(userRepo as any, auditRepo as any);

      // Act & Assert
      await expect(uc.execute('edu-1', makeInput({ maxUses: null }))).resolves.toBeDefined();
    });

    it('maxUses = 1 geçerlidir (alt sınır)', async () => {
      // Arrange
      const userRepo = makeUserRepo();
      const auditRepo = makeAuditRepo();
      const created = makeCreatedCode({ maxUses: 1 });
      (prisma.discountCode.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.discountCode.create as jest.Mock).mockResolvedValue(created);

      const uc = new CreateDiscountCodeUseCase(userRepo as any, auditRepo as any);

      // Act & Assert
      await expect(uc.execute('edu-1', makeInput({ maxUses: 1 }))).resolves.toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // Tarih validasyon hataları
  // -------------------------------------------------------------------------
  describe('tarih validasyon hataları', () => {
    it('validUntil validFrom ile aynı anda ise INVALID_DATES hatası fırlatır', async () => {
      // Arrange
      const userRepo = makeUserRepo();
      const auditRepo = makeAuditRepo();
      const uc = new CreateDiscountCodeUseCase(userRepo as any, auditRepo as any);
      const now = new Date('2026-06-01');

      // Act & Assert
      await expect(
        uc.execute('edu-1', makeInput({ validFrom: now, validUntil: now })),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'INVALID_DATES' }),
      });
    });

    it('validUntil validFrom öncesinde ise INVALID_DATES hatası fırlatır', async () => {
      // Arrange
      const userRepo = makeUserRepo();
      const auditRepo = makeAuditRepo();
      const uc = new CreateDiscountCodeUseCase(userRepo as any, auditRepo as any);

      // Act & Assert
      await expect(
        uc.execute('edu-1', makeInput({
          validFrom: new Date('2026-07-01'),
          validUntil: new Date('2026-06-01'),
        })),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'INVALID_DATES' }),
      });
    });

    it('validFrom eksik ama validUntil var ise tarih kontrolü atlanır', async () => {
      // Arrange
      const userRepo = makeUserRepo();
      const auditRepo = makeAuditRepo();
      const created = makeCreatedCode({ validFrom: null, validUntil: new Date('2027-01-01') });
      (prisma.discountCode.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.discountCode.create as jest.Mock).mockResolvedValue(created);

      const uc = new CreateDiscountCodeUseCase(userRepo as any, auditRepo as any);

      // Act & Assert — hata fırlatmamalı
      await expect(
        uc.execute('edu-1', makeInput({ validFrom: null, validUntil: new Date('2027-01-01') })),
      ).resolves.toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // Tekrar eden kod hatası
  // -------------------------------------------------------------------------
  describe('tekrar eden kod hatası', () => {
    it('kod zaten varsa CODE_EXISTS BadRequestException fırlatır', async () => {
      // Arrange
      const userRepo = makeUserRepo();
      const auditRepo = makeAuditRepo();
      (prisma.discountCode.findUnique as jest.Mock).mockResolvedValue(makeCreatedCode());

      const uc = new CreateDiscountCodeUseCase(userRepo as any, auditRepo as any);

      // Act & Assert
      await expect(uc.execute('edu-1', makeInput())).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'CODE_EXISTS' }),
      });
    });

    it('küçük harfli kod büyük harfe çevrilip duplicate kontrolü yapılır — duplicate bulununca CODE_EXISTS', async () => {
      // Arrange
      const userRepo = makeUserRepo();
      const auditRepo = makeAuditRepo();
      // findUnique 'SAVE10' için mevcut kodu döndürür
      (prisma.discountCode.findUnique as jest.Mock).mockImplementation(
        async ({ where }: { where: { code: string } }) =>
          where.code === 'SAVE10' ? makeCreatedCode() : null,
      );

      const uc = new CreateDiscountCodeUseCase(userRepo as any, auditRepo as any);

      // Act & Assert — 'save10' normalize edilince 'SAVE10' ile çakışır
      await expect(uc.execute('edu-1', makeInput({ code: 'save10' }))).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'CODE_EXISTS' }),
      });
    });
  });

  // -------------------------------------------------------------------------
  // Audit log başarısız olsa bile ana akış tamamlanır
  // -------------------------------------------------------------------------
  describe('audit log hata toleransı', () => {
    it('auditRepo.create başarısız olsa bile kod oluşturma tamamlanır', async () => {
      // Arrange
      const userRepo = makeUserRepo();
      const auditRepo = { create: jest.fn(async () => { throw new Error('audit failure'); }) };
      const created = makeCreatedCode();
      (prisma.discountCode.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.discountCode.create as jest.Mock).mockResolvedValue(created);

      const uc = new CreateDiscountCodeUseCase(userRepo as any, auditRepo as any);

      // Act & Assert — hata fırlatmamalı
      await expect(uc.execute('edu-1', makeInput())).resolves.toMatchObject({
        code: 'SAVE10',
      });
    });
  });
});
