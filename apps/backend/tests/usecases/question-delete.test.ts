import { DeleteQuestionUseCase } from '../../src/application/use-cases/question/DeleteQuestionUseCase';

jest.mock('../../src/infrastructure/database/prisma', () => ({
  prisma: {
    examQuestion: {
      findUnique: jest.fn(),
      delete: jest.fn(async () => ({})),
    },
    attemptAnswer: { count: jest.fn(async () => 0) },
  },
}));
import { prisma } from '../../src/infrastructure/database/prisma';

function makeQuestion(testId = 'test-1', educatorId = 'edu-1') {
  return { testId, test: { educatorId } };
}

describe('DeleteQuestionUseCase', () => {
  beforeEach(() => jest.clearAllMocks());

  it('sahip eğitici kendi sorusunu siler', async () => {
    (prisma.examQuestion.findUnique as jest.Mock).mockResolvedValue(makeQuestion());
    const uc = new DeleteQuestionUseCase();
    await expect(uc.execute('test-1', 'q-1', 'edu-1')).resolves.toBeUndefined();
    expect(prisma.examQuestion.delete).toHaveBeenCalledWith({ where: { id: 'q-1' } });
  });

  it('soru bulunamazsa NOT_FOUND fırlatır', async () => {
    (prisma.examQuestion.findUnique as jest.Mock).mockResolvedValue(null);
    const uc = new DeleteQuestionUseCase();
    await expect(uc.execute('test-1', 'bad-q', 'edu-1')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('soru farklı bir teste aitse NOT_FOUND fırlatır', async () => {
    (prisma.examQuestion.findUnique as jest.Mock).mockResolvedValue(makeQuestion('other-test'));
    const uc = new DeleteQuestionUseCase();
    await expect(uc.execute('test-1', 'q-1', 'edu-1')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('başkasının sorusunu silmeye çalışırsa FORBIDDEN fırlatır', async () => {
    (prisma.examQuestion.findUnique as jest.Mock).mockResolvedValue(makeQuestion('test-1', 'other-edu'));
    const uc = new DeleteQuestionUseCase();
    await expect(uc.execute('test-1', 'q-1', 'edu-1')).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('cevaplanmış soru silinemez → QUESTION_HAS_ATTEMPTS', async () => {
    (prisma.examQuestion.findUnique as jest.Mock).mockResolvedValue(makeQuestion());
    (prisma.attemptAnswer.count as jest.Mock).mockResolvedValueOnce(3);
    const uc = new DeleteQuestionUseCase();
    await expect(uc.execute('test-1', 'q-1', 'edu-1')).rejects.toMatchObject({ code: 'QUESTION_HAS_ATTEMPTS' });
  });

  it('cevap yoksa delete çağrılır', async () => {
    (prisma.examQuestion.findUnique as jest.Mock).mockResolvedValue(makeQuestion());
    (prisma.attemptAnswer.count as jest.Mock).mockResolvedValueOnce(0);
    const uc = new DeleteQuestionUseCase();
    await uc.execute('test-1', 'q-1', 'edu-1');
    expect(prisma.examQuestion.delete).toHaveBeenCalledTimes(1);
  });
});
