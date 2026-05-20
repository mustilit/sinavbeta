// @ts-nocheck
import { AppError } from '../../errors/AppError';
import { IObjectionRepository } from '../../../domain/interfaces/IObjectionRepository';
import { IUserRepository } from '../../../domain/interfaces/IUserRepository';
import { IAuditLogRepository } from '../../../domain/interfaces/IAuditLogRepository';
import { ensureEducatorActive } from '../../policies/ensureEducatorActive';

/** Eğiticinin bir itiraza yanıt verebileceği maksimum gün sayısı (SLA süresi) */
const SLA_DAYS = 10;
/** SLA süresinin milisaniye cinsinden karşılığı; zaman hesaplamalarında kullanılır */
const SLA_MS = SLA_DAYS * 24 * 60 * 60 * 1000;

/**
 * Bir testin sahibi olan eğiticinin, adayın oluşturduğu bir itiraza
 * yanıt vermesini sağlar.
 *
 * SLA kontrolü: İtiraz oluşturulmasından itibaren 10 gün geçmişse
 * itiraz otomatik olarak ESCALATED (üst merciye iletildi) durumuna alınır
 * ve yanıt verilmesine izin verilmez.
 */
export class AnswerObjectionUseCase {
  constructor(
    private readonly objectionRepo: IObjectionRepository,
    private readonly userRepo: IUserRepository,
    private readonly auditRepo: IAuditLogRepository,
  ) {}

  /**
   * İtirazı yanıtlar.
   *
   * @param input.objectionId - Yanıtlanacak itirazın kimliği
   * @param input.answerText  - Eğiticinin yanıt metni (en az 5 karakter)
   * @param actorId           - İşlemi gerçekleştiren kullanıcının kimliği
   * @returns Güncellenmiş itiraz bilgileri (id, durum, yanıt metni, yanıt tarihi)
   */
  async execute(
    input: { objectionId: string; answerText: string },
    actorId: string | undefined,
  ): Promise<{ id: string; status: string; answerText: string; answeredAt: Date }> {
    if (!actorId) {
      throw new AppError('UNAUTHORIZED', 'Authentication required', 401);
    }

    const user = await this.userRepo.findById(actorId);
    if (!user) throw new AppError('USER_NOT_FOUND', 'User not found', 404);
    // Yalnızca aktif eğiticiler yanıt verebilir
    ensureEducatorActive(user);

    // İtirazı, bağlı olduğu testin sahibiyle birlikte yükle
    const withOwner = await this.objectionRepo.findByIdWithTestOwner(input.objectionId);
    if (!withOwner) {
      throw new AppError('OBJECTION_NOT_FOUND', 'Objection not found', 404);
    }
    const { objection, educatorId } = withOwner;
    const ownerId = educatorId;
    if (ownerId == null) {
      throw new AppError('OBJECTION_OWNER_NOT_RESOLVED', 'Could not resolve test owner for this objection', 500);
    }
    // Yalnızca testin sahibi olan eğitici yanıt verebilir
    if (ownerId !== actorId) {
      throw new AppError('FORBIDDEN_NOT_OWNER', 'Only the test educator can answer this objection', 403);
    }

    const answerText = input.answerText?.trim() ?? '';
    if (answerText.length < 5) {
      throw new AppError('ANSWER_TOO_SHORT', 'Answer must be at least 5 characters', 400);
    }

    // SLA kontrolü: itirazın oluşturulma tarihinden bu yana geçen süreyi hesapla
    const now = new Date();
    const createdAt = objection.createdAt instanceof Date ? objection.createdAt : new Date(objection.createdAt);
    const elapsedMs = now.getTime() - createdAt.getTime();
    if (elapsedMs > SLA_MS) {
      // SLA süresi dolmuşsa ve henüz eskalasyon yapılmamışsa durumu güncelle
      if (objection.status !== 'ESCALATED') {
        await this.objectionRepo.escalate(input.objectionId, { status: 'ESCALATED', escalatedAt: now });
        try {
          await this.auditRepo.create({
            action: 'OBJECTION_ESCALATED',
            entityType: 'OBJECTION',
            entityId: input.objectionId,
            actorId,
            metadata: { reason: 'SLA_EXPIRED' },
          });
        } catch {
          // best-effort: audit log hatası ana akışı kesmez
        }
      }
      throw new AppError('OBJECTION_SLA_EXPIRED', 'Objection SLA has expired; it has been escalated', 409);
    }

    // Yanıtı kaydet ve durumu ANSWERED olarak işaretle
    const updated = await this.objectionRepo.updateAnswer(input.objectionId, {
      answerText,
      answeredAt: now,
      status: 'ANSWERED',
    });
    if (!updated) throw new AppError('OBJECTION_NOT_FOUND', 'Objection not found', 404);

    try {
      await this.auditRepo.create({
        action: 'OBJECTION_ANSWERED',
        entityType: 'OBJECTION',
        entityId: input.objectionId,
        actorId,
        metadata: {},
      });
    } catch {
      // best-effort: audit log hatası ana akışı kesmez
    }

    return {
      id: updated.id,
      status: updated.status,
      answerText: updated.answerText ?? answerText,
      answeredAt: updated.answeredAt ?? now,
    };
  }
}
