import { prisma } from '../../../infrastructure/database/prisma';
import { AppError } from '../../errors/AppError';

/**
 * Adayın kendi notunu siler. Sahiplik zorunlu.
 */
export class DeleteCandidateNoteUseCase {
  async execute(noteId: string, actorId?: string | null) {
    if (!actorId) throw new AppError('UNAUTHORIZED', 'Giriş gerekli', 401);

    const existing = await prisma.candidateNote.findUnique({
      where: { id: noteId },
      select: { id: true, candidateId: true },
    });
    if (!existing) throw new AppError('NOTE_NOT_FOUND', 'Not bulunamadı', 404);
    if (existing.candidateId !== actorId)
      throw new AppError('FORBIDDEN', 'Bu not size ait değil', 403);

    await prisma.candidateNote.delete({ where: { id: noteId } });
    return { ok: true };
  }
}
