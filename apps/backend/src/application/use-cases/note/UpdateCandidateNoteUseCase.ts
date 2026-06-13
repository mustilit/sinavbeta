import { prisma } from '../../../infrastructure/database/prisma';
import { AppError } from '../../errors/AppError';
import { serializeNote } from './CreateCandidateNoteUseCase';

const MAX_BODY = 5000;

/**
 * Adayın kendi notunun metnini günceller. Adresleme (snapshot) değişmez —
 * sadece body. Sahiplik zorunlu.
 */
export class UpdateCandidateNoteUseCase {
  async execute(noteId: string, body: string, actorId?: string | null) {
    if (!actorId) throw new AppError('UNAUTHORIZED', 'Giriş gerekli', 401);
    const text = (body ?? '').trim();
    if (!text) throw new AppError('NOTE_EMPTY', 'Not boş olamaz', 400);
    if (text.length > MAX_BODY)
      throw new AppError('NOTE_TOO_LONG', `Not en fazla ${MAX_BODY} karakter olabilir`, 400);

    const existing = await prisma.candidateNote.findUnique({
      where: { id: noteId },
      select: { id: true, candidateId: true },
    });
    if (!existing) throw new AppError('NOTE_NOT_FOUND', 'Not bulunamadı', 404);
    if (existing.candidateId !== actorId)
      throw new AppError('FORBIDDEN', 'Bu not size ait değil', 403);

    const updated = await prisma.candidateNote.update({
      where: { id: noteId },
      data: { body: text },
    });
    return serializeNote(updated);
  }
}
