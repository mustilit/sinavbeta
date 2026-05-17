import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { prisma } from '../../infrastructure/database/prisma';
import { AppError } from '../errors/AppError';

function generateJoinCode(): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export class CreateRound2LiveSessionUseCase {
  async execute(sessionId: string, educatorId: string) {
    const original = await prisma.liveSession.findUnique({
      where: { id: sessionId },
      include: { questions: { include: { options: true } } },
    });

    if (!original) throw new AppError('SESSION_NOT_FOUND', 'Oturum bulunamadı', 404);
    if (original.educatorId !== educatorId)
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Yetki yok' });
    if (original.status !== 'ENDED')
      throw new BadRequestException({ code: 'SESSION_NOT_ENDED', message: 'Oturum henüz bitmedi' });
    if (original.roundNumber !== 1)
      throw new BadRequestException({ code: 'NOT_ROUND1', message: 'Sadece 1. turdan 2. tur oluşturulabilir' });

    // Only participants of round 1 are allowed in round 2
    // We store parentSessionId to track this

    let joinCode = generateJoinCode();
    let attempts = 0;
    while (attempts < 10) {
      const exists = await prisma.liveSession.findUnique({ where: { joinCode } });
      if (!exists) break;
      joinCode = generateJoinCode();
      attempts++;
    }

    const round2 = await prisma.liveSession.create({
      data: {
        educatorId,
        tierId: original.tierId,
        maxParticipants: original.maxParticipants,
        title: `${original.title} - Tur 2`,
        joinCode,
        status: 'DRAFT',
        roundNumber: 2,
        parentSessionId: original.id,
        questions: {
          create: original.questions.map((q) => ({
            content: q.content,
            mediaUrl: q.mediaUrl,
            order: q.order,
            options: {
              create: q.options.map((o) => ({
                content: o.content,
                isCorrect: o.isCorrect,
                order: o.order,
              })),
            },
          })),
        },
      },
      include: {
        questions: { include: { options: true } },
      },
    });

    return round2;
  }
}
