// @ts-nocheck
import { Body, Controller, ForbiddenException, Get, Inject, Param, Patch, Post, Req } from '@nestjs/common';
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
  private readonly prisma: PrismaClient;

  constructor(@Inject(PrismaService) prismaService: PrismaService) {
    this.prisma = prismaService.client;
    const prisma: PrismaClient = this.prisma;
    this.startUC = new StartTestAttemptUseCase(prisma);
    this.pauseUC = new PauseTestAttemptUseCase(prisma);
    this.resumeUC = new ResumeTestAttemptUseCase(prisma);
    this.getUC = new GetTestAttemptUseCase(prisma);
    this.submitAnswerUC = new SubmitAnswerUseCase(prisma);
    this.submitAttemptUC = new SubmitAttemptUseCase(prisma);

    const attemptRepo = new PrismaAttemptRepository();
    const examRepo = new PrismaExamRepository();
    const answerRepo = new PrismaAttemptAnswerRepository();
    this.getStateUC = new GetAttemptStateUseCase(attemptRepo, examRepo, answerRepo);
    this.getResultUC = new GetAttemptResultUseCase(attemptRepo, examRepo, answerRepo);
    this.timeoutUC = new TimeoutAttemptUseCase(attemptRepo, examRepo, answerRepo);
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
}

