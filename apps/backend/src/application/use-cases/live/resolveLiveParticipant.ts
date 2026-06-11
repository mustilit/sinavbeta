import { prisma } from '../../../infrastructure/database/prisma';

/** Canlı oturum katılımcı kimliği: kayıtlı kullanıcı (userId) VEYA misafir (guestToken). */
export type LiveActor = { userId?: string | null; guestToken?: string | null };

/**
 * Kayıtlı kullanıcı (userId → sessionId_userId) VEYA misafir (guestToken → unique)
 * için LiveParticipant kaydını çözer. Misafirde token başka oturuma aitse null döner
 * (token bir oturuma bağlı; çapraz-oturum kullanımı engellenir).
 */
export async function resolveLiveParticipant(sessionId: string, actor: LiveActor | undefined) {
  if (!actor) return null;
  if (actor.userId) {
    return prisma.liveParticipant.findUnique({
      where: { sessionId_userId: { sessionId, userId: actor.userId } },
    });
  }
  if (actor.guestToken) {
    const p = await prisma.liveParticipant.findUnique({ where: { guestToken: actor.guestToken } as any });
    return p && p.sessionId === sessionId ? p : null;
  }
  return null;
}
