import { BadRequestException, Body, Controller, ForbiddenException, Get, Inject, Logger, Param, Patch, Post, Req } from '@nestjs/common';
import { Roles } from '../decorators/roles.decorator';
import type { PrismaClient } from '@prisma/client';
import { StartTestAttemptUseCase } from '../../application/use-cases/attempt/StartTestAttemptUseCase';
import { PauseTestAttemptUseCase } from '../../application/use-cases/attempt/PauseTestAttemptUseCase';
import { ResumeTestAttemptUseCase } from '../../application/use-cases/attempt/ResumeTestAttemptUseCase';
import { GetTestAttemptUseCase } from '../../application/use-cases/attempt/GetTestAttemptUseCase';
import { SubmitAnswerUseCase } from '../../application/use-cases/attempt/SubmitAnswerUseCase';
import { GetAttemptStateUseCase } from '../../application/use-cases/attempt/GetAttemptStateUseCase';
import { GetAttemptResultUseCase } from '../../application/use-cases/attempt/GetAttemptResultUseCase';
import { SubmitAttemptUseCase } from '../../application/use-cases/attempt/SubmitAttemptUseCase';
import { TimeoutAttemptUseCase } from '../../application/use-cases/attempt/TimeoutAttemptUseCase';
import { LogAttemptAnomalyUseCase } from '../../application/use-cases/attempt/LogAttemptAnomalyUseCase';
import { GetQuestionSolutionUseCase } from '../../application/use-cases/question/GetQuestionSolutionUseCase';
import { PrismaAttemptRepository } from '../../infrastructure/repositories/PrismaAttemptRepository';
import { PrismaExamRepository } from '../../infrastructure/repositories/PrismaExamRepository';
import { PrismaAttemptAnswerRepository } from '../../infrastructure/repositories/PrismaAttemptAnswerRepository';
import { PrismaService } from '../modules/prisma/prisma.service';

/**
 * Test denemesi yaşam döngüsünü yönetir: başlatma, duraklatma, devam etme,
 * cevap gönderme ve mevcut deneme durumunu sorgulama.
 * Tüm endpoint'ler CANDIDATE rolüne kısıtlıdır.
 *
 * Not: Bu controller use-case'leri Prisma inject ile manuel olarak oluşturur
 * (NestJS modül DI yerine); tutarlılık için ileride modüle taşınabilir.
 */
@Controller()
export class AttemptsController {
  private readonly startUC: StartTestAttemptUseCase;
  private readonly pauseUC: PauseTestAttemptUseCase;
  private readonly resumeUC: ResumeTestAttemptUseCase;
  private readonly getUC: GetTestAttemptUseCase;
  private readonly submitAnswerUC: SubmitAnswerUseCase;
  private readonly getStateUC: GetAttemptStateUseCase;
  private readonly getResultUC: GetAttemptResultUseCase;
  private readonly submitAttemptUC: SubmitAttemptUseCase;
  private readonly timeoutUC: TimeoutAttemptUseCase;
  private readonly anomalyUC: LogAttemptAnomalyUseCase;
  private readonly getSolutionUC: GetQuestionSolutionUseCase;
  private readonly prisma: PrismaClient;
  private readonly logger = new Logger(AttemptsController.name);

  constructor(@Inject(PrismaService) prismaService: PrismaService) {
    this.prisma = prismaService.client;
    const prisma: PrismaClient = this.prisma;
    this.startUC = new StartTestAttemptUseCase(prisma);
    this.pauseUC = new PauseTestAttemptUseCase(prisma);
    this.resumeUC = new ResumeTestAttemptUseCase(prisma);
    this.getUC = new GetTestAttemptUseCase(prisma);
    this.submitAnswerUC = new SubmitAnswerUseCase(prisma);
    this.submitAttemptUC = new SubmitAttemptUseCase(prisma);
    this.anomalyUC = new LogAttemptAnomalyUseCase(prisma);

    const attemptRepo = new PrismaAttemptRepository();
    const examRepo = new PrismaExamRepository();
    const answerRepo = new PrismaAttemptAnswerRepository();
    this.getStateUC = new GetAttemptStateUseCase(attemptRepo, examRepo, answerRepo);
    this.getResultUC = new GetAttemptResultUseCase(attemptRepo, examRepo, answerRepo);
    this.timeoutUC = new TimeoutAttemptUseCase(attemptRepo, examRepo, answerRepo);
    this.getSolutionUC = new GetQuestionSolutionUseCase(attemptRepo, examRepo);
  }

  /** Yeni deneme başlatır — tenantId çoklu kiracı senaryosu için iletilir */
  @Post('tests/:id/start')
  @Roles('CANDIDATE')
  async start(@Param('id') testId: string, @Req() req: any) {
    const userId = (req as any).user?.id;
    const tenantId = (req as any).tenant?.id;
    return this.startUC.execute(testId, userId, tenantId);
  }

  @Post('attempts/:id/pause')
  @Roles('CANDIDATE')
  async pause(@Param('id') attemptId: string, @Req() req: any) {
    const userId = (req as any).user?.id;
    return this.pauseUC.execute(attemptId, userId);
  }

  @Post('attempts/:id/resume')
  @Roles('CANDIDATE')
  async resume(@Param('id') attemptId: string, @Req() req: any) {
    const userId = (req as any).user?.id;
    return this.resumeUC.execute(attemptId, userId);
  }

  @Post('attempts/:id/answer')
  @Roles('CANDIDATE')
  async answer(
    @Param('id') attemptId: string,
    @Body() body: { questionId: string; selectedOptionId?: string | null },
    @Req() req: any,
  ) {
    const userId = (req as any).user?.id;
    return this.submitAnswerUC.execute(attemptId, body.questionId, body.selectedOptionId, userId);
  }

  /** dalClient.js submitAnswer → POST /attempts/:id/answers (plural) */
  @Post('attempts/:id/answers')
  @Roles('CANDIDATE')
  async answers(
    @Param('id') attemptId: string,
    @Body() body: { questionId: string; optionId?: string | null; selectedOptionId?: string | null },
    @Req() req: any,
  ) {
    const userId = (req as any).user?.id;
    const optionId = body.optionId ?? body.selectedOptionId ?? null;
    return this.submitAnswerUC.execute(attemptId, body.questionId, optionId, userId);
  }

  /** dalClient.js getState → GET /attempts/:id/state */
  @Get('attempts/:id/state')
  @Roles('CANDIDATE')
  async state(@Param('id') attemptId: string, @Req() req: any) {
    const userId = (req as any).user?.id;
    return this.getStateUC.execute(attemptId, userId);
  }

  /** Periyodik ilerleme kaydı — elapsedSeconds → metadata */
  @Patch('attempts/:id/checkpoint')
  @Roles('CANDIDATE')
  async checkpoint(
    @Param('id') attemptId: string,
    @Body() body: { elapsedSeconds?: number },
    @Req() req: any,
  ) {
    const userId = (req as any).user?.id;
    const row = await this.prisma.testAttempt.findUnique({
      where: { id: attemptId },
      select: { candidateId: true, status: true, metadata: true },
    });
    if (!row || row.candidateId !== userId) throw new ForbiddenException();
    if (row.status !== 'IN_PROGRESS') return { ok: true };
    const prev = (row.metadata as any) ?? {};
    await (this.prisma.testAttempt as any).update({
      where: { id: attemptId },
      data: {
        metadata: {
          ...prev,
          elapsedSeconds: body.elapsedSeconds ?? prev.elapsedSeconds ?? 0,
          savedAt: new Date().toISOString(),
        },
      },
    });
    return { ok: true };
  }

  /** dalClient.js finish → POST /attempts/:id/finish */
  @Post('attempts/:id/finish')
  @Roles('CANDIDATE')
  async finish(@Param('id') attemptId: string, @Req() req: any) {
    const userId = (req as any).user?.id;
    return this.submitAttemptUC.execute(attemptId, undefined, userId);
  }

  /** dalClient.js timeout → POST /attempts/:id/timeout */
  @Post('attempts/:id/timeout')
  @Roles('CANDIDATE')
  async timeout(@Param('id') attemptId: string, @Req() req: any) {
    const userId = (req as any).user?.id;
    return this.timeoutUC.execute(attemptId, userId);
  }

  /** dalClient.js getResult → GET /attempts/:id/result */
  @Get('attempts/:id/result')
  @Roles('CANDIDATE')
  async result(@Param('id') attemptId: string, @Req() req: any) {
    const userId = (req as any).user?.id;
    return this.getResultUC.execute(attemptId, userId);
  }

  @Get('attempts/:id')
  @Roles('CANDIDATE')
  async get(@Param('id') attemptId: string, @Req() req: any) {
    const userId = (req as any).user?.id;
    return this.getUC.execute(attemptId, userId);
  }

  /** Submit sonrası soru çözümü — yalnız tamamlanmış attempt için. */
  @Get('attempts/:id/questions/:questionId/solution')
  @Roles('CANDIDATE')
  async getQuestionSolution(
    @Param('id') attemptId: string,
    @Param('questionId') questionId: string,
    @Req() req: any,
  ) {
    const userId = (req as any).user?.id;
    return this.getSolutionUC.execute(attemptId, questionId, userId);
  }

  /**
   * Anti-leak / anti-cheat event logger.
   * useTestProctoring hook'u tab switch, devtools heuristic, copy attempt,
   * fullscreen exit gibi olayları buraya gönderir. Throttle backend tarafında.
   */
  @Post('attempts/:id/anomaly')
  @Roles('CANDIDATE')
  async anomaly(
    @Param('id') attemptId: string,
    @Body() body: { type: string; payload?: unknown },
    @Req() req: any,
  ) {
    const userId = (req as any).user?.id;
    return this.anomalyUC.execute(attemptId, userId, body?.type, body?.payload);
  }

  /**
   * "Paketi Yeniden Çöz" — aday paketteki TÜM testleri yeni bir tur olarak sıfırlar.
   * Açık (IN_PROGRESS/PAUSED) denemeler olduğu gibi finalize edilir (cevaplar/history
   * korunur), Purchase.attemptsResetAt = now yazılır. Bundan sonra Start her test için
   * YENİ deneme açar (attemptNumber+1). 'Aynı anda aktiflik yok' garantisi.
   */
  @Post('packages/:id/reset-attempts')
  @Roles('CANDIDATE')
  async resetPackageAttempts(@Param('id') packageId: string, @Req() req: any) {
    const userId = (req as any).user?.id;
    if (!userId) throw new ForbiddenException({ message: 'UNAUTHENTICATED' });

    const purchase = await this.prisma.purchase.findFirst({ where: { packageId, candidateId: userId } as any });
    if (!purchase) throw new ForbiddenException({ code: 'NO_PURCHASE', message: 'Bu paket için satın alma kaydınız yok' });

    const tests = await this.prisma.examTest.findMany({ where: { packageId, deletedAt: null } as any, select: { id: true } });
    const testIds = tests.map((t) => t.id);

    // Bu turda (son reset'ten sonra başlamış) hiç deneme yoksa sıfırlanacak bir şey
    // yoktur — boş bir attemptsResetAt kaydı yazmayı engelle ("sıfır paket boş kayıt").
    const existingReset = (purchase as any).attemptsResetAt ? new Date((purchase as any).attemptsResetAt) : null;
    const allAttempts = testIds.length
      ? await this.prisma.testAttempt.findMany({
          where: { testId: { in: testIds }, candidateId: userId } as any,
          select: { id: true, status: true, startedAt: true } as any,
        })
      : [];
    const inCurrentRound = (a: any) =>
      !existingReset || (a.startedAt && new Date(a.startedAt).getTime() > existingReset.getTime());
    const currentRound = (allAttempts as any[]).filter(inCurrentRound);
    if (currentRound.length === 0) {
      throw new BadRequestException({
        code: 'NOTHING_TO_RESET',
        message: 'Bu turda başlanmış veya çözülmüş test yok; sıfırlanacak bir şey yok.',
      });
    }

    let finalized = 0;
    const open = currentRound.filter((a) => a.status === 'IN_PROGRESS' || a.status === 'PAUSED');
    for (const a of open) {
      try {
        await this.submitAttemptUC.execute(a.id, undefined, userId);
        finalized++;
      } catch {
        try {
          await this.prisma.testAttempt.update({
            where: { id: a.id },
            data: { status: 'SUBMITTED', submittedAt: new Date(), finishedAt: new Date() } as any,
          });
          finalized++;
        } catch { /* best-effort finalize */ }
      }
    }

    const now = new Date();
    await this.prisma.purchase.update({ where: { id: purchase.id }, data: { attemptsResetAt: now } as any });
    this.logger.log(`attempt.package_reset packageId=${packageId} candidate=${userId} finalized=${finalized} tests=${testIds.length}`);

    return { ok: true, resetAt: now, finalized };
  }

  /**
   * Paket deneme durumu (aday) — UI için: her test Başla(NEW)/Devam(IN_PROGRESS)/
   * İncele(COMPLETED) + kıyas için tamamlanmış denemelerin toplam skor özetleri.
   * resetAt'tan önce başlamış denemeler "geçmiş tur" → state NEW olur.
   */
  @Get('packages/:id/attempt-state')
  @Roles('CANDIDATE')
  async packageAttemptState(@Param('id') packageId: string, @Req() req: any) {
    const userId = (req as any).user?.id;
    if (!userId) throw new ForbiddenException({ message: 'UNAUTHENTICATED' });

    const purchase = await this.prisma.purchase.findFirst({
      where: { packageId, candidateId: userId } as any,
      select: { attemptsResetAt: true } as any,
    });
    const resetAt = (purchase as any)?.attemptsResetAt ? new Date((purchase as any).attemptsResetAt) : null;

    const tests = await this.prisma.examTest.findMany({ where: { packageId, deletedAt: null } as any, select: { id: true, _count: { select: { questions: true } } } as any });
    const testIds = tests.map((t) => t.id);
    const attempts = testIds.length
      ? await this.prisma.testAttempt.findMany({
          where: { testId: { in: testIds }, candidateId: userId } as any,
          select: { id: true, testId: true, attemptNumber: true, status: true, score: true, startedAt: true, submittedAt: true, answers: { select: { isCorrect: true, selectedOptionId: true } } } as any,
          orderBy: [{ testId: 'asc' }, { attemptNumber: 'asc' }] as any,
        })
      : [];

    const byTest = new Map<string, any[]>();
    for (const a of attempts as any[]) {
      const arr = byTest.get(a.testId) ?? [];
      arr.push(a);
      byTest.set(a.testId, arr);
    }
    const isCurrent = (a: any) => !resetAt || (a.startedAt && new Date(a.startedAt).getTime() > resetAt.getTime());

    const result = (tests as any[]).map((t: any) => {
      const list = byTest.get(t.id) ?? [];
      const latest = list.length ? list[list.length - 1] : null;
      let state = 'NEW';
      let currentAttemptId: string | null = null;
      if (latest && isCurrent(latest)) {
        if (latest.status === 'IN_PROGRESS' || latest.status === 'PAUSED') { state = 'IN_PROGRESS'; currentAttemptId = latest.id; }
        else if (latest.status === 'SUBMITTED' || latest.status === 'TIMEOUT') { state = 'COMPLETED'; currentAttemptId = latest.id; }
      }
      const totalQ = (t as any)._count?.questions ?? 0;
      const attemptsSummary = list
        .filter((a) => a.status === 'SUBMITTED' || a.status === 'TIMEOUT')
        .map((a) => {
          const ans = (a.answers ?? []) as Array<{ isCorrect: boolean | null; selectedOptionId: string | null }>;
          const correct = ans.filter((x) => x.isCorrect === true).length;
          const wrong = ans.filter((x) => x.isCorrect === false && x.selectedOptionId != null).length;
          const empty = Math.max(0, totalQ - correct - wrong);
          return { attemptId: a.id, attemptNumber: a.attemptNumber, score: a.score, submittedAt: a.submittedAt, correct, wrong, empty, total: totalQ };
        });
      return { testId: t.id, state, currentAttemptId, attempts: attemptsSummary };
    });

    return { resetAt, tests: result };
  }
}

