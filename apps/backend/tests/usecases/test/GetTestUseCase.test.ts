/**
 * GetTestUseCase testleri
 *
 * Doğrulanan davranışlar:
 * - ExamTest ID ile direkt test bulunur
 * - ExamTest ID ile bulunamazsa TestPackage ID olarak denenecek
 * - TestPackage ID ile pakette test yoksa null döner
 * - TestPackage ID ile paketteki ilk test döner
 */

const mockExamTestFindFirst = jest.fn();

jest.mock('../../../src/infrastructure/database/prisma', () => ({
  prisma: {
    examTest: { findFirst: (...args: any[]) => mockExamTestFindFirst(...args) },
  },
}));

import { GetTestUseCase } from '../../../src/application/use-cases/test/GetTestUseCase';

function makeExamRepo(test: any, overrides: Partial<any> = {}) {
  return {
    findById: jest.fn().mockResolvedValue(test),
    ...overrides,
  };
}

function makeTest(overrides: Record<string, any> = {}) {
  return {
    id: 'test-1',
    title: 'Test Adı',
    educatorId: 'edu-1',
    status: 'PUBLISHED',
    questions: [],
    ...overrides,
  };
}

describe('GetTestUseCase', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockExamTestFindFirst.mockResolvedValue(null);
  });

  it('ExamTest ID ile direkt test bulunur', async () => {
    const examRepo = makeExamRepo(makeTest());
    const uc = new GetTestUseCase(examRepo as any);
    const result = await uc.execute('test-1');
    expect(result).toBeDefined();
    expect(result.id).toBe('test-1');
    expect(mockExamTestFindFirst).not.toHaveBeenCalled();
  });

  it('ExamTest bulunamazsa TestPackage ID olarak denenecek', async () => {
    const examRepo = makeExamRepo(null);
    mockExamTestFindFirst.mockResolvedValue({ id: 'test-1' });
    // İkinci findById çağrısında test döner
    examRepo.findById
      .mockResolvedValueOnce(null)  // ilk çağrı: ExamTest ID olarak arıyor
      .mockResolvedValueOnce(makeTest()); // ikinci çağrı: packagedaki test
    const uc = new GetTestUseCase(examRepo as any);
    const result = await uc.execute('pkg-1');
    expect(mockExamTestFindFirst).toHaveBeenCalledTimes(1);
    expect(result).toBeDefined();
  });

  it('TestPackage ID ile pakette test yoksa null döner', async () => {
    const examRepo = makeExamRepo(null);
    mockExamTestFindFirst.mockResolvedValue(null); // paket boş
    const uc = new GetTestUseCase(examRepo as any);
    const result = await uc.execute('pkg-empty');
    expect(result).toBeNull();
  });

  it('hem ExamTest hem Package olmayan ID → null döner', async () => {
    const examRepo = makeExamRepo(null);
    const uc = new GetTestUseCase(examRepo as any);
    const result = await uc.execute('non-existent');
    expect(result).toBeNull();
  });
});
