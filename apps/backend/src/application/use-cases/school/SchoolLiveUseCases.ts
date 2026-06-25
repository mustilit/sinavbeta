/**
 * E-Sınıf — Sprint 4-B: Okul canlı sınavı. Marketplace live modülüne DOKUNMAZ;
 * paylaşılan LiveSession/LiveQuestion/LiveOption/LiveParticipant/LiveAnswer
 * tablolarını schoolId ile kullanır. Ödeme yok; yıllık kota (School.usedLiveCount).
 */
import { prisma } from '../../../infrastructure/database/prisma';
import { AppError } from '../../errors/AppError';
import { logger } from '../../../infrastructure/logger/logger';
import { resolveSchoolContext, requireSchoolRole } from './schoolHelpers';

async function uniqueJoinCode(): Promise<string> {
  for (let i = 0; i < 50; i++) {
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const clash = await prisma.liveSession.findUnique({ where: { joinCode: code }, select: { id: true } });
    if (!clash) return code;
  }
  throw new AppError('CODE_GEN_FAILED', 'Katılım kodu üretilemedi', 500);
}

export class CreateSchoolLiveSessionUseCase {
  async execute(
    input: { title: string; questions: Array<{ content: string; options: Array<{ content: string; isCorrect?: boolean }> }> },
    actorId?: string,
  ) {
    const ctx = await resolveSchoolContext(actorId);
    requireSchoolRole(ctx, 'TEACHER', 'DEPT_HEAD');
    const title = (input.title ?? '').trim();
    if (!title) throw new AppError('TITLE_REQUIRED', 'Başlık zorunlu', 400);
    const qs = input.questions ?? [];
    if (qs.length === 0) throw new AppError('NO_QUESTIONS', 'En az bir soru gerekli', 400);
    qs.forEach((q, i) => {
      if (!q.content?.trim()) throw new AppError('QUESTION_CONTENT_REQUIRED', `Soru ${i + 1}: içerik zorunlu`, 400);
      const opts = q.options ?? [];
      if (opts.length < 2) throw new AppError('TOO_FEW_OPTIONS', `Soru ${i + 1}: en az 2 şık`, 400);
      if (opts.filter((o) => o.isCorrect).length !== 1) throw new AppError('ONE_CORRECT_REQUIRED', `Soru ${i + 1}: tam 1 doğru şık`, 400);
    });

    // Kota: annualLiveLimit>0 ise (ended + aktif) < limit olmalı
    const school = await prisma.school.findUnique({ where: { id: ctx.schoolId }, select: { annualLiveLimit: true, usedLiveCount: true } });
    if (!school) throw new AppError('SCHOOL_NOT_FOUND', 'Okul bulunamadı', 404);
    if (school.annualLiveLimit > 0) {
      const active = await prisma.liveSession.count({ where: { schoolId: ctx.schoolId, status: { in: ['DRAFT', 'ACTIVE'] } } });
      if (school.usedLiveCount + active >= school.annualLiveLimit) {
        throw new AppError('LIVE_QUOTA_EXCEEDED', 'Yıllık canlı sınav kotası dolu', 409);
      }
    }

    const joinCode = await uniqueJoinCode();
    const session = await prisma.$transaction(async (tx) => {
      const s = await tx.liveSession.create({
        data: { educatorId: actorId as string, schoolId: ctx.schoolId, title, joinCode, status: 'DRAFT', paidAt: new Date() },
      });
      for (let i = 0; i < qs.length; i++) {
        const q = qs[i];
        const lq = await tx.liveQuestion.create({ data: { sessionId: s.id, content: q.content.trim(), order: i + 1 } });
        await tx.liveOption.createMany({ data: q.options.map((o, j) => ({ questionId: lq.id, content: o.content.trim(), isCorrect: !!o.isCorrect, order: j + 1 })) });
      }
      return s;
    });
    logger.info('school.live.created', { id: session.id, schoolId: ctx.schoolId, actorId });
    return { id: session.id, joinCode: session.joinCode };
  }
}

export class ListSchoolLiveSessionsUseCase {
  async execute(actorId?: string) {
    const ctx = await resolveSchoolContext(actorId);
    requireSchoolRole(ctx, 'TEACHER', 'DEPT_HEAD');
    const rows = await prisma.liveSession.findMany({
      where: { schoolId: ctx.schoolId, educatorId: actorId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, title: true, joinCode: true, status: true, currentQuestionIdx: true, _count: { select: { questions: true, participants: true } }, createdAt: true },
    });
    return rows.map((s) => ({ id: s.id, title: s.title, joinCode: s.joinCode, status: s.status, questionCount: s._count.questions, participantCount: s._count.participants, createdAt: s.createdAt }));
  }
}

async function ownSession(sessionId: string, ctx: { schoolId: string }, actorId: string) {
  const s = await prisma.liveSession.findFirst({ where: { id: sessionId, schoolId: ctx.schoolId, educatorId: actorId } });
  if (!s) throw new AppError('SESSION_NOT_FOUND', 'Oturum bulunamadı', 404);
  return s;
}

/** Host görünümü — sorular (doğru dahil) + katılımcı + güncel soru cevap dağılımı. */
export class GetSchoolLiveHostStateUseCase {
  async execute(sessionId: string, actorId?: string) {
    const ctx = await resolveSchoolContext(actorId);
    requireSchoolRole(ctx, 'TEACHER', 'DEPT_HEAD');
    const s = await prisma.liveSession.findFirst({
      where: { id: sessionId, schoolId: ctx.schoolId, educatorId: actorId },
      include: { questions: { orderBy: { order: 'asc' }, include: { options: { orderBy: { order: 'asc' } } } }, _count: { select: { participants: true } } },
    });
    if (!s) throw new AppError('SESSION_NOT_FOUND', 'Oturum bulunamadı', 404);
    const cur = s.questions[s.currentQuestionIdx] ?? null;
    let distribution: Array<{ optionId: string; count: number }> = [];
    if (cur) {
      const grouped = await prisma.liveAnswer.groupBy({ by: ['optionId'], where: { questionId: cur.id }, _count: { _all: true } });
      distribution = grouped.filter((g) => g.optionId).map((g) => ({ optionId: g.optionId as string, count: g._count._all }));
    }
    return {
      id: s.id, title: s.title, joinCode: s.joinCode, status: s.status, currentQuestionIdx: s.currentQuestionIdx,
      participantCount: s._count.participants, questionCount: s.questions.length,
      questions: s.questions.map((q) => ({ id: q.id, content: q.content, options: q.options.map((o) => ({ id: o.id, content: o.content, isCorrect: o.isCorrect })) })),
      currentDistribution: distribution,
    };
  }
}

export class StartSchoolLiveSessionUseCase {
  async execute(sessionId: string, actorId?: string) {
    const ctx = await resolveSchoolContext(actorId);
    requireSchoolRole(ctx, 'TEACHER', 'DEPT_HEAD');
    await ownSession(sessionId, ctx, actorId as string);
    await prisma.liveSession.update({ where: { id: sessionId }, data: { status: 'ACTIVE', startedAt: new Date(), currentQuestionIdx: 0 } });
    return { ok: true };
  }
}

export class AdvanceSchoolLiveSessionUseCase {
  async execute(sessionId: string, actorId?: string) {
    const ctx = await resolveSchoolContext(actorId);
    requireSchoolRole(ctx, 'TEACHER', 'DEPT_HEAD');
    const s = await ownSession(sessionId, ctx, actorId as string);
    const qCount = await prisma.liveQuestion.count({ where: { sessionId } });
    const next = Math.min(s.currentQuestionIdx + 1, qCount - 1);
    await prisma.liveSession.update({ where: { id: sessionId }, data: { currentQuestionIdx: next } });
    return { currentQuestionIdx: next };
  }
}

export class EndSchoolLiveSessionUseCase {
  async execute(sessionId: string, actorId?: string) {
    const ctx = await resolveSchoolContext(actorId);
    requireSchoolRole(ctx, 'TEACHER', 'DEPT_HEAD');
    const s = await ownSession(sessionId, ctx, actorId as string);
    if (s.status === 'ENDED') return { ok: true, alreadyEnded: true };
    await prisma.$transaction([
      prisma.liveSession.update({ where: { id: sessionId }, data: { status: 'ENDED', endedAt: new Date() } }),
      // Kota: tamamlanan oturum +1 (race-safe sınır kontrolü gevşek — admin limiti aşımı engellenmiş zaten)
      prisma.school.update({ where: { id: ctx.schoolId }, data: { usedLiveCount: { increment: 1 } } }),
    ]);
    logger.info('school.live.ended', { sessionId, schoolId: ctx.schoolId, actorId });
    return { ok: true };
  }
}

/** Öğrenci kodla katılır (yalnız aynı okul). */
export class JoinSchoolLiveSessionUseCase {
  async execute(input: { joinCode: string }, actorId?: string) {
    const ctx = await resolveSchoolContext(actorId);
    requireSchoolRole(ctx, 'STUDENT');
    const code = (input.joinCode ?? '').trim();
    const s = await prisma.liveSession.findUnique({ where: { joinCode: code }, select: { id: true, schoolId: true, status: true } });
    if (!s || !s.schoolId) throw new AppError('SESSION_NOT_FOUND', 'Oturum bulunamadı', 404);
    if (s.schoolId !== ctx.schoolId) throw new AppError('CROSS_SCHOOL', 'Bu oturum okulunuza ait değil', 403);
    if (s.status === 'ENDED') throw new AppError('SESSION_ENDED', 'Oturum sona erdi', 409);
    await prisma.liveParticipant.upsert({
      where: { sessionId_userId: { sessionId: s.id, userId: actorId as string } },
      create: { sessionId: s.id, userId: actorId as string },
      update: { lastSeenAt: new Date() },
    });
    return { sessionId: s.id };
  }
}

/** Öğrenci görünümü — güncel soru (doğru SIZDIRMAZ) + kendi cevabı + durum. */
export class GetSchoolLiveParticipantStateUseCase {
  async execute(sessionId: string, actorId?: string) {
    const ctx = await resolveSchoolContext(actorId);
    requireSchoolRole(ctx, 'STUDENT');
    const s = await prisma.liveSession.findFirst({
      where: { id: sessionId, schoolId: ctx.schoolId },
      include: { questions: { orderBy: { order: 'asc' }, include: { options: { orderBy: { order: 'asc' } } } } },
    });
    if (!s) throw new AppError('SESSION_NOT_FOUND', 'Oturum bulunamadı', 404);
    const part = await prisma.liveParticipant.findUnique({ where: { sessionId_userId: { sessionId, userId: actorId as string } }, select: { id: true } });
    if (!part) throw new AppError('NOT_JOINED', 'Önce katılın', 409);

    if (s.status === 'ENDED') {
      // Sonuç: doğru sayısı
      const answers = await prisma.liveAnswer.findMany({ where: { participantId: part.id }, include: { option: { select: { isCorrect: true } } } });
      const correct = answers.filter((a) => a.option?.isCorrect).length;
      return { status: 'ENDED', score: correct, total: s.questions.length };
    }
    if (s.status === 'DRAFT') return { status: 'DRAFT' };

    const cur = s.questions[s.currentQuestionIdx] ?? null;
    let myOptionId: string | null = null;
    if (cur) {
      const ans = await prisma.liveAnswer.findUnique({ where: { questionId_participantId: { questionId: cur.id, participantId: part.id } }, select: { optionId: true } });
      myOptionId = ans?.optionId ?? null;
    }
    return {
      status: 'ACTIVE',
      currentQuestionIdx: s.currentQuestionIdx,
      questionCount: s.questions.length,
      question: cur ? { id: cur.id, content: cur.content, options: cur.options.map((o) => ({ id: o.id, content: o.content })) } : null,
      myOptionId,
    };
  }
}

export class SubmitSchoolLiveAnswerUseCase {
  async execute(sessionId: string, input: { questionId: string; optionId: string }, actorId?: string) {
    const ctx = await resolveSchoolContext(actorId);
    requireSchoolRole(ctx, 'STUDENT');
    const s = await prisma.liveSession.findFirst({ where: { id: sessionId, schoolId: ctx.schoolId }, select: { id: true, status: true, currentQuestionIdx: true, questions: { orderBy: { order: 'asc' }, select: { id: true } } } });
    if (!s) throw new AppError('SESSION_NOT_FOUND', 'Oturum bulunamadı', 404);
    if (s.status !== 'ACTIVE') throw new AppError('NOT_ACTIVE', 'Oturum aktif değil', 409);
    // Yalnız güncel soruya cevap
    const curId = s.questions[s.currentQuestionIdx]?.id;
    if (input.questionId !== curId) throw new AppError('NOT_CURRENT_QUESTION', 'Yalnız güncel soruyu cevaplayabilirsiniz', 409);
    const part = await prisma.liveParticipant.findUnique({ where: { sessionId_userId: { sessionId, userId: actorId as string } }, select: { id: true } });
    if (!part) throw new AppError('NOT_JOINED', 'Önce katılın', 409);
    const opt = await prisma.liveOption.findFirst({ where: { id: input.optionId, questionId: input.questionId }, select: { id: true } });
    if (!opt) throw new AppError('INVALID_OPTION', 'Geçersiz şık', 400);

    await prisma.liveAnswer.upsert({
      where: { questionId_participantId: { questionId: input.questionId, participantId: part.id } },
      create: { sessionId, questionId: input.questionId, participantId: part.id, optionId: input.optionId },
      update: { optionId: input.optionId, answeredAt: new Date() },
    });
    return { ok: true };
  }
}
