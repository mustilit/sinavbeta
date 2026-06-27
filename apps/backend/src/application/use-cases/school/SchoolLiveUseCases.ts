/**
 * E-Sınıf — Sprint 4-B: Okul canlı sınavı. Marketplace live modülüne DOKUNMAZ;
 * paylaşılan LiveSession/LiveQuestion/LiveOption/LiveParticipant/LiveAnswer
 * tablolarını schoolId ile kullanır. Ödeme yok; yıllık kota (School.usedLiveCount).
 */
import { prisma } from '../../../infrastructure/database/prisma';
import { AppError } from '../../errors/AppError';
import { logger } from '../../../infrastructure/logger/logger';
import { resolveSchoolContext, requireSchoolRole, resolveLiveCreatorScope, liveScopeWhere, type SchoolContext } from './schoolHelpers';

// Canlı sınav: tüm okul personeli (yönetici + zümre + öğretmen) görür ve oluşturur.
const LIVE_STAFF_ROLES = ['SCHOOL_ADMIN', 'BRANCH_ADMIN', 'DEPT_HEAD', 'TEACHER'] as const;

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
    input: { title: string; questions: Array<{ content?: string; mediaUrl?: string; options: Array<{ content?: string; mediaUrl?: string; isCorrect?: boolean }> }> },
    actorId?: string,
  ) {
    const ctx = await resolveSchoolContext(actorId);
    requireSchoolRole(ctx, ...LIVE_STAFF_ROLES);
    const title = (input.title ?? '').trim();
    if (!title) throw new AppError('TITLE_REQUIRED', 'Başlık zorunlu', 400);
    const rawQs = input.questions ?? [];
    if (rawQs.length === 0) throw new AppError('NO_QUESTIONS', 'En az bir soru gerekli', 400);
    // Market editörü ile aynı: boş şıklar elenir; içerik VEYA görsel yeterli; tam 1 doğru.
    const qs = rawQs.map((q, i) => {
      if (!q.content?.trim() && !q.mediaUrl) throw new AppError('QUESTION_CONTENT_REQUIRED', `Soru ${i + 1}: içerik zorunlu`, 400);
      const filled = (q.options ?? []).filter((o) => o.content?.trim() || o.mediaUrl);
      if (filled.length < 2) throw new AppError('TOO_FEW_OPTIONS', `Soru ${i + 1}: en az 2 şık`, 400);
      if (filled.filter((o) => o.isCorrect).length !== 1) throw new AppError('ONE_CORRECT_REQUIRED', `Soru ${i + 1}: tam 1 doğru şık`, 400);
      return { content: q.content, mediaUrl: q.mediaUrl, options: filled };
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
    const scope = await resolveLiveCreatorScope(ctx); // hiyerarşik görünürlük snapshot'ı
    const session = await prisma.$transaction(async (tx) => {
      const s = await tx.liveSession.create({
        data: { educatorId: actorId as string, schoolId: ctx.schoolId, title, joinCode, status: 'DRAFT', paidAt: new Date(), ...scope },
      });
      for (let i = 0; i < qs.length; i++) {
        const q = qs[i];
        const lq = await tx.liveQuestion.create({ data: { sessionId: s.id, content: (q.content ?? '').trim(), mediaUrl: q.mediaUrl || null, order: i + 1 } });
        await tx.liveOption.createMany({ data: q.options.map((o, j) => ({ questionId: lq.id, content: (o.content ?? '').trim(), mediaUrl: o.mediaUrl || null, isCorrect: !!o.isCorrect, order: j + 1 })) });
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
    requireSchoolRole(ctx, ...LIVE_STAFF_ROLES);
    const scope = await liveScopeWhere(ctx); // hiyerarşik görünürlük (admin: tümü)
    const rows = await prisma.liveSession.findMany({
      where: { schoolId: ctx.schoolId, ...(scope ?? {}) },
      orderBy: { createdAt: 'desc' },
      select: { id: true, title: true, joinCode: true, status: true, currentQuestionIdx: true, _count: { select: { questions: true, participants: true } }, createdAt: true },
    });
    return rows.map((s) => ({ id: s.id, title: s.title, joinCode: s.joinCode, status: s.status, questionCount: s._count.questions, participantCount: s._count.participants, createdAt: s.createdAt }));
  }
}

// Kapsam içindeki oturum (kendi hiyerarşisi); admin tüm okul. Yönetici kendi
// hiyerarşisindeki oturumları da yönetebilir (görmenin doğal uzantısı).
async function scopedSession(sessionId: string, ctx: SchoolContext) {
  const scope = await liveScopeWhere(ctx);
  const s = await prisma.liveSession.findFirst({ where: { id: sessionId, schoolId: ctx.schoolId, ...(scope ?? {}) } });
  if (!s) throw new AppError('SESSION_NOT_FOUND', 'Oturum bulunamadı', 404);
  return s;
}

// Aktif katılımcı eşiği — son 20 sn içinde ping atan (market ile aynı heartbeat penceresi).
const ACTIVE_WINDOW_MS = 20000;

/**
 * Host görünümü — market LiveSessionHost.jsx ile BİREBİR aynı state şekli:
 * currentQuestion (doğru dahil) + stats[qid] (şık dağılımı + içerik + doğru) + aktif
 * katılımcı. roundNumber/round2/maxParticipants alanları okul tarafında yok (1/null).
 */
export class GetSchoolLiveHostStateUseCase {
  async execute(sessionId: string, actorId?: string) {
    const ctx = await resolveSchoolContext(actorId);
    requireSchoolRole(ctx, ...LIVE_STAFF_ROLES);
    const scope = await liveScopeWhere(ctx);
    const s = await prisma.liveSession.findFirst({
      where: { id: sessionId, schoolId: ctx.schoolId, ...(scope ?? {}) },
      include: { questions: { orderBy: { order: 'asc' }, include: { options: { orderBy: { order: 'asc' } } } }, _count: { select: { participants: true } } },
    });
    if (!s) throw new AppError('SESSION_NOT_FOUND', 'Oturum bulunamadı', 404);
    const cur = s.questions[s.currentQuestionIdx] ?? null;
    const activeParticipantCount = await prisma.liveParticipant.count({
      where: { sessionId: s.id, lastSeenAt: { gte: new Date(Date.now() - ACTIVE_WINDOW_MS) } },
    });
    const stats: Record<string, Array<{ optionId: string; content: string; isCorrect: boolean; count: number }>> = {};
    if (cur) {
      const grouped = await prisma.liveAnswer.groupBy({ by: ['optionId'], where: { questionId: cur.id }, _count: { _all: true } });
      const countByOpt = new Map(grouped.filter((g) => g.optionId).map((g) => [g.optionId as string, g._count._all]));
      stats[cur.id] = cur.options.map((o) => ({ optionId: o.id, content: o.content, isCorrect: o.isCorrect, count: countByOpt.get(o.id) ?? 0 }));
    }
    return {
      id: s.id, title: s.title, joinCode: s.joinCode, status: s.status,
      currentQuestionIdx: s.currentQuestionIdx, totalQuestions: s.questions.length,
      participantCount: s._count.participants, activeParticipantCount,
      showStats: s.showStats, roundNumber: 1, round2: null, maxParticipants: null,
      currentQuestion: cur
        ? { id: cur.id, content: cur.content, mediaUrl: cur.mediaUrl ?? null, options: cur.options.map((o) => ({ id: o.id, content: o.content, mediaUrl: o.mediaUrl ?? null, isCorrect: o.isCorrect })) }
        : null,
      stats,
    };
  }
}

export class StartSchoolLiveSessionUseCase {
  async execute(sessionId: string, actorId?: string) {
    const ctx = await resolveSchoolContext(actorId);
    requireSchoolRole(ctx, ...LIVE_STAFF_ROLES);
    await scopedSession(sessionId, ctx);
    await prisma.liveSession.update({ where: { id: sessionId }, data: { status: 'ACTIVE', startedAt: new Date(), currentQuestionIdx: 0 } });
    return { ok: true };
  }
}

export class AdvanceSchoolLiveSessionUseCase {
  async execute(sessionId: string, actorId?: string) {
    const ctx = await resolveSchoolContext(actorId);
    requireSchoolRole(ctx, ...LIVE_STAFF_ROLES);
    const s = await scopedSession(sessionId, ctx);
    const qCount = await prisma.liveQuestion.count({ where: { sessionId } });
    const next = Math.min(s.currentQuestionIdx + 1, qCount - 1);
    await prisma.liveSession.update({ where: { id: sessionId }, data: { currentQuestionIdx: next } });
    return { currentQuestionIdx: next };
  }
}

/** Önceki soruya dön (market 'prev' — inceleme/geri navigasyon). */
export class PrevSchoolLiveSessionUseCase {
  async execute(sessionId: string, actorId?: string) {
    const ctx = await resolveSchoolContext(actorId);
    requireSchoolRole(ctx, ...LIVE_STAFF_ROLES);
    const s = await scopedSession(sessionId, ctx);
    const prev = Math.max(0, s.currentQuestionIdx - 1);
    await prisma.liveSession.update({ where: { id: sessionId }, data: { currentQuestionIdx: prev } });
    return { currentQuestionIdx: prev };
  }
}

/** İstatistik (şık dağılımı) görünürlüğünü aç/kapat (market 'toggleStats'). */
export class ToggleSchoolLiveStatsUseCase {
  async execute(sessionId: string, actorId?: string) {
    const ctx = await resolveSchoolContext(actorId);
    requireSchoolRole(ctx, ...LIVE_STAFF_ROLES);
    const s = await scopedSession(sessionId, ctx);
    const updated = await prisma.liveSession.update({ where: { id: sessionId }, data: { showStats: !s.showStats }, select: { showStats: true } });
    return { showStats: updated.showStats };
  }
}

/** Öğrenci heartbeat — aktif katılımcı sayımı için lastSeenAt günceller (market 'ping'). */
export class PingSchoolLiveSessionUseCase {
  async execute(sessionId: string, actorId?: string) {
    const ctx = await resolveSchoolContext(actorId);
    requireSchoolRole(ctx, 'STUDENT');
    await prisma.liveParticipant.updateMany({ where: { sessionId, userId: actorId as string }, data: { lastSeenAt: new Date() } });
    return { ok: true };
  }
}

export class EndSchoolLiveSessionUseCase {
  async execute(sessionId: string, actorId?: string) {
    const ctx = await resolveSchoolContext(actorId);
    requireSchoolRole(ctx, ...LIVE_STAFF_ROLES);
    const s = await scopedSession(sessionId, ctx);
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

/**
 * Öğrenci görünümü — market LiveSessionJoin.jsx ile BİREBİR aynı state şekli:
 * DRAFT (bekleme), ACTIVE (currentQuestion — doğru SIZDIRMAZ; eğitici istatistik
 * açtıysa stats[qid] gelir), ENDED (myResults: skor + soru bazlı detay).
 */
export class GetSchoolLiveParticipantStateUseCase {
  async execute(sessionId: string, actorId?: string) {
    const ctx = await resolveSchoolContext(actorId);
    requireSchoolRole(ctx, 'STUDENT');
    const s = await prisma.liveSession.findFirst({
      where: { id: sessionId, schoolId: ctx.schoolId },
      include: { questions: { orderBy: { order: 'asc' }, include: { options: { orderBy: { order: 'asc' } } } }, _count: { select: { participants: true } } },
    });
    if (!s) throw new AppError('SESSION_NOT_FOUND', 'Oturum bulunamadı', 404);
    const part = await prisma.liveParticipant.findUnique({ where: { sessionId_userId: { sessionId, userId: actorId as string } }, select: { id: true } });
    if (!part) throw new AppError('NOT_JOINED', 'Önce katılın', 409);

    const base = { id: s.id, title: s.title, participantCount: s._count.participants, totalQuestions: s.questions.length, roundNumber: 1 };

    if (s.status === 'DRAFT') return { ...base, status: 'DRAFT' };

    if (s.status === 'ENDED') {
      const answers = await prisma.liveAnswer.findMany({ where: { participantId: part.id }, include: { option: { select: { id: true, content: true, isCorrect: true } } } });
      const byQ = new Map(answers.map((a) => [a.questionId, a]));
      const detail = s.questions.map((q) => {
        const a = byQ.get(q.id);
        const correctOpt = q.options.find((o) => o.isCorrect);
        return {
          questionId: q.id,
          questionContent: q.content,
          chosenOptionId: a?.optionId ?? null,
          chosenOptionContent: a?.option?.content ?? null,
          correctOptionContent: correctOpt?.content ?? null,
          isCorrect: !!a?.option?.isCorrect,
        };
      });
      const correct = detail.filter((d) => d.isCorrect).length;
      return { ...base, status: 'ENDED', myResults: { correct, total: s.questions.length, answers: detail, round1Results: null } };
    }

    // ACTIVE
    const cur = s.questions[s.currentQuestionIdx] ?? null;
    let myAnswer: string | null = null;
    if (cur) {
      const ans = await prisma.liveAnswer.findUnique({ where: { questionId_participantId: { questionId: cur.id, participantId: part.id } }, select: { optionId: true } });
      myAnswer = ans?.optionId ?? null;
    }
    let stats: Record<string, Array<{ optionId: string; content: string; isCorrect: boolean; count: number }>> | undefined;
    if (s.showStats && cur) {
      const grouped = await prisma.liveAnswer.groupBy({ by: ['optionId'], where: { questionId: cur.id }, _count: { _all: true } });
      const countByOpt = new Map(grouped.filter((g) => g.optionId).map((g) => [g.optionId as string, g._count._all]));
      stats = { [cur.id]: cur.options.map((o) => ({ optionId: o.id, content: o.content, isCorrect: o.isCorrect, count: countByOpt.get(o.id) ?? 0 })) };
    }
    return {
      ...base,
      status: 'ACTIVE',
      currentQuestionIdx: s.currentQuestionIdx,
      showStats: s.showStats,
      currentQuestion: cur ? { id: cur.id, content: cur.content, mediaUrl: cur.mediaUrl ?? null, options: cur.options.map((o) => ({ id: o.id, content: o.content, mediaUrl: o.mediaUrl ?? null })) } : null,
      myAnswer,
      ...(stats ? { stats } : {}),
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
