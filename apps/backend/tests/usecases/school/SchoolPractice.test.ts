/**
 * E-Sınıf serbest alıştırma (Keşfet) — exam-scoped çözme.
 * Liste seviye filtreli; çözme ekranı doğru cevap sızdırmaz; TEST otomatik puanlanır;
 * seviye uyuşmazlığı reddedilir; tekrar çözmede sıfırlanır.
 */
jest.mock('../../../src/infrastructure/database/prisma', () => ({
  prisma: {
    schoolUser: { findFirst: jest.fn() },
    classroom: { findUnique: jest.fn() },
    schoolExam: { findFirst: jest.fn(), findMany: jest.fn() },
    schoolSubmission: { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
    schoolSubmissionAnswer: { upsert: jest.fn(), update: jest.fn(), create: jest.fn(), deleteMany: jest.fn() },
    schoolTunnelAttempt: { findMany: jest.fn() },
    $transaction: jest.fn(async (arg: any) => {
      if (typeof arg === 'function') {
        return arg({
          schoolSubmissionAnswer: { update: jest.fn(), create: jest.fn() },
          schoolSubmission: { update: jest.fn() },
        });
      }
      return Promise.all(arg);
    }),
  },
}));
jest.mock('../../../src/infrastructure/database/dbRouter', () => ({ prismaRead: jest.fn() }));

import {
  ListStudentLevelExamsUseCase,
  GetPracticeSolveUseCase,
  SubmitPracticeUseCase,
  StartPracticeUseCase,
  GetPracticeResultUseCase,
} from '../../../src/application/use-cases/school/SchoolPracticeUseCases';
import { prisma } from '../../../src/infrastructure/database/prisma';
import { prismaRead } from '../../../src/infrastructure/database/dbRouter';

const p = prisma as any;
const read = prismaRead as jest.Mock;
const student = { id: 'su1', schoolId: 'sch1', schoolRole: 'STUDENT', branchId: null, departmentId: null, classroomId: 'c1' };

const examTest = (over = {}) => ({
  id: 'e1', schoolId: 'sch1', isArchived: false, examType: 'TEST', title: 'T', gradeLevel: 5, durationMinutes: 20,
  questions: [{ id: 'q1', content: 'S1', mediaUrl: null, points: 2, order: 1, solutionText: null, options: [{ id: 'o1', content: 'A', isCorrect: true, order: 1 }, { id: 'o2', content: 'B', isCorrect: false, order: 2 }] }],
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  p.schoolUser.findFirst.mockResolvedValue(student);
  p.classroom.findUnique.mockResolvedValue({ gradeLevel: 5 });
});

describe('ListStudentLevelExamsUseCase', () => {
  it('seviyedeki sınavları durumla + facet (counts/total/subjects) döner', async () => {
    read.mockReturnValue({
      schoolExam: {
        groupBy: jest.fn().mockResolvedValue([{ examType: 'TEST', _count: { _all: 1 } }, { examType: 'TUNNEL', _count: { _all: 1 } }]),
        count: jest.fn().mockResolvedValue(2),
        findMany: jest.fn().mockResolvedValue([
          { id: 'e1', title: 'T', examType: 'TEST', subject: 'Mat', topic: null, durationMinutes: 20, gradeLevel: 5, _count: { questions: 3 } },
          { id: 'u1', title: 'Tün', examType: 'TUNNEL', subject: 'Fen', topic: null, durationMinutes: null, gradeLevel: 5, _count: { questions: 30 } },
        ]),
      },
      schoolSubmission: { findMany: jest.fn().mockResolvedValue([{ examId: 'e1', status: 'GRADED', totalScore: 4, maxScore: 6 }]) },
      schoolTunnelAttempt: { findMany: jest.fn().mockResolvedValue([{ examId: 'u1', status: 'COMPLETED' }]) },
    });
    const r = await new ListStudentLevelExamsUseCase().execute({ examType: 'TEST', page: 1 }, 'su1');
    expect(r.gradeLevel).toBe(5);
    expect(r.total).toBe(2);
    expect(r.counts).toMatchObject({ TEST: 1, TUNNEL: 1 });
    expect(r.items.find((i: any) => i.id === 'e1')).toMatchObject({ status: 'GRADED', score: 4, maxScore: 6 });
    expect(r.items.find((i: any) => i.id === 'u1')).toMatchObject({ status: 'COMPLETED' });
  });

  it('sınıfı yoksa boş liste + sıfır facet', async () => {
    p.classroom.findUnique.mockResolvedValue(null);
    const r = await new ListStudentLevelExamsUseCase().execute({}, 'su1');
    expect(r).toEqual({ items: [], total: 0, gradeLevel: null, counts: { TEST: 0, TUNNEL: 0, WRITTEN: 0 }, subjects: [] });
  });
});

describe('GetPracticeSolveUseCase — doğru cevap sızmaz', () => {
  it('şıklarda isCorrect bulunmaz', async () => {
    p.schoolExam.findFirst.mockResolvedValue(examTest());
    p.schoolSubmission.findUnique.mockResolvedValue(null);
    const r = await new GetPracticeSolveUseCase().execute('e1', 'su1');
    expect('isCorrect' in r.questions[0].options[0]).toBe(false);
    expect(r.open).toBe(true);
  });

  it('TUNNEL → meta döner (examType TUNNEL)', async () => {
    p.schoolExam.findFirst.mockResolvedValue(examTest({ examType: 'TUNNEL' }));
    const r = await new GetPracticeSolveUseCase().execute('e1', 'su1');
    expect(r.examType).toBe('TUNNEL');
    expect(r.examId).toBe('e1');
  });

  it('seviye uyuşmazlığı → 403', async () => {
    p.schoolExam.findFirst.mockResolvedValue(examTest({ gradeLevel: 8 }));
    await expect(new GetPracticeSolveUseCase().execute('e1', 'su1')).rejects.toMatchObject({ status: 403 });
  });
});

describe('SubmitPracticeUseCase — TEST otomatik puanlama', () => {
  it('doğru şık → tam puan, GRADED', async () => {
    p.schoolExam.findFirst.mockResolvedValue(examTest());
    p.schoolSubmission.findUnique.mockResolvedValue({ id: 's1', status: 'IN_PROGRESS', answers: [{ id: 'an1', questionId: 'q1', selectedOptionId: 'o1' }] });
    const r = await new SubmitPracticeUseCase().execute('e1', 'su1');
    expect(r).toMatchObject({ status: 'GRADED', totalScore: 2, maxScore: 2 });
  });
});

describe('GetPracticeResultUseCase — çözüldüğü versiyon (snapshot)', () => {
  it('sınav sonradan güncellense de sonuç snapshot versiyonunu gösterir', async () => {
    // Canlı sınav DEĞİŞTİ: q1 içeriği + şıklar farklı.
    p.schoolExam.findFirst.mockResolvedValue(examTest({
      questions: [{ id: 'q1', content: 'GÜNCEL SORU', mediaUrl: null, points: 5, order: 1, solutionText: 'yeni çözüm', options: [{ id: 'oX', content: 'X', isCorrect: true, order: 1 }] }],
    }));
    p.schoolSubmission.findUnique.mockResolvedValue({
      id: 's1', status: 'GRADED', totalScore: 2, maxScore: 2,
      questionsSnapshot: [{ id: 'q1', content: 'ESKİ SORU', points: 2, order: 1, solutionText: 'eski çözüm', mediaUrl: null, solutionMediaUrl: null, options: [{ id: 'o1', content: 'A', isCorrect: true, order: 1 }, { id: 'o2', content: 'B', isCorrect: false, order: 2 }] }],
      answers: [{ questionId: 'q1', selectedOptionId: 'o1', isCorrect: true, earnedPoints: 2 }],
    });
    const r = await new GetPracticeResultUseCase().execute('e1', 'su1');
    expect(r.questions[0].content).toBe('ESKİ SORU');
    expect(r.questions[0].solutionText).toBe('eski çözüm');
    expect(r.questions[0].options.map((o: any) => o.id)).toEqual(['o1', 'o2']);
  });

  it('snapshot yoksa canlı sınava düşer (eski teslimler)', async () => {
    p.schoolExam.findFirst.mockResolvedValue(examTest());
    p.schoolSubmission.findUnique.mockResolvedValue({
      id: 's1', status: 'GRADED', totalScore: 2, maxScore: 2, questionsSnapshot: null,
      answers: [{ questionId: 'q1', selectedOptionId: 'o1', isCorrect: true, earnedPoints: 2 }],
    });
    const r = await new GetPracticeResultUseCase().execute('e1', 'su1');
    expect(r.questions[0].content).toBe('S1');
  });
});

describe('SubmitPracticeUseCase — snapshot yazılır', () => {
  it('teslim sırasında questionsSnapshot kaydedilir', async () => {
    p.schoolExam.findFirst.mockResolvedValue(examTest());
    p.schoolSubmission.findUnique.mockResolvedValue({ id: 's1', status: 'IN_PROGRESS', answers: [{ id: 'an1', questionId: 'q1', selectedOptionId: 'o1' }] });
    const txUpdate = jest.fn();
    p.$transaction.mockImplementationOnce(async (fn: any) => fn({ schoolSubmissionAnswer: { update: jest.fn(), create: jest.fn() }, schoolSubmission: { update: txUpdate } }));
    await new SubmitPracticeUseCase().execute('e1', 'su1');
    const data = txUpdate.mock.calls[0][0].data;
    expect(Array.isArray(data.questionsSnapshot)).toBe(true);
    expect(data.questionsSnapshot[0].options[0]).toHaveProperty('isCorrect');
  });
});

describe('StartPracticeUseCase — tekrar çözmede sıfırla', () => {
  it('teslim edilmiş alıştırma yeniden başlatılınca reset', async () => {
    p.schoolExam.findFirst.mockResolvedValue(examTest());
    p.schoolSubmission.findUnique.mockResolvedValue({ id: 's1', status: 'GRADED' });
    const r = await new StartPracticeUseCase().execute('e1', 'su1');
    expect(r).toMatchObject({ submissionId: 's1', reset: true });
    expect(p.$transaction).toHaveBeenCalled();
  });
});
