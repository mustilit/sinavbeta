// @ts-nocheck
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { prisma } from '../../../infrastructure/database/prisma';
import { AppError } from '../../errors/AppError';

function generateJoinCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

interface CreateLiveSessionInput {
  educatorId: string;
  title: string;
  tierId?: string | null;
  maxParticipants?: number | null;
  questions: Array<{
    content: string;
    mediaUrl?: string | null;
    order: number;
    options: Array<{ content: string; isCorrect: boolean; order: number }>;
  }>;
}

export class CreateLiveSessionUseCase {
  async execute(input: CreateLiveSessionInput) {
    const { educatorId, title, questions, tierId } = input;
    const educator = await prisma.user.findUnique({ where: { id: educatorId } });
    if (!educator) throw new AppError('USER_NOT_FOUND', 'Educator not found', 404);
    if (educator.role !== 'EDUCATOR' && educator.role !== 'ADMIN')
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Only educators can create live sessions' });
    if (educator.status !== 'ACTIVE')
      throw new BadRequestException({ code: 'EDUCATOR_NOT_ACTIVE', message: 'Educator account is not active' });
    if (!title?.trim()) throw new AppError('VALIDATION_ERROR', 'Title is required', 400);
    if (!questions || questions.length === 0)
      throw new AppError('VALIDATION_ERROR', 'At least one question is required', 400);

    // Admin ayarlarından canlı soru limit kontrolü
    const settings = await prisma.adminSettings.findFirst({ where: { id: 1 } });
    const maxLive = (settings as any)?.maxLiveQuestions ?? 50;
    if (questions.length > maxLive) {
      throw new AppError('LIVE_QUESTION_LIMIT_EXCEEDED', `Canlı oturumda en fazla ${maxLive} soru olabilir`, 400);
    }

    for (const q of questions) {
      if (!q.content?.trim()) throw new AppError('VALIDATION_ERROR', 'Question content cannot be empty', 400);
      if (!q.options || q.options.length < 2)
        throw new AppError('VALIDATION_ERROR', 'Each question must have at least 2 options', 400);
      if (!q.options.some((o) => o.isCorrect))
        throw new AppError('VALIDATION_ERROR', 'Each question must have at least one correct option', 400);
    }

    let maxParticipants: number | null = null;
    let resolvedTierId: string | null = null;
    if (tierId) {
      const tier = await prisma.liveSessionTier.findUnique({ where: { id: tierId } });
      if (!tier || !tier.isActive) throw new AppError('TIER_NOT_FOUND', 'Selected tier not found or inactive', 400);
      maxParticipants = tier.maxParticipants ?? null;
      resolvedTierId = tier.id;
    }

    let joinCode = generateJoinCode();
    let attempts = 0;
    while (attempts < 10) {
      const existing = await prisma.liveSession.findUnique({ where: { joinCode } });
      if (!existing) break;
      joinCode = generateJoinCode();
      attempts++;
    }

    return prisma.liveSession.create({
      data: {
        educatorId,
        title: title.trim(),
        joinCode,
        status: 'DRAFT',
        tierId: resolvedTierId,
        maxParticipants,
        questions: {
          create: questions.map((q) => ({
            content: q.content.trim(),
            mediaUrl: q.mediaUrl ?? null,
            order: q.order,
            options: {
              create: q.options.map((o) => ({
                content: o.content.trim(),
                isCorrect: o.isCorrect,
                order: o.order,
              })),
            },
          })),
        },
      },
      include: {
        tier: true,
        questions: { orderBy: { order: 'asc' }, include: { options: { orderBy: { order: 'asc' } } } },
      },
    });
  }
}
