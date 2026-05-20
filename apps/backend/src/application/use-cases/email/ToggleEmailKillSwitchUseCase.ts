import { PrismaClient } from '@prisma/client';
import { prisma } from '../../../infrastructure/database/prisma';
import { isValidWindow } from '../../services/email/utils/sendWindow';

const ALLOWED_KEYS = [
  'emailEnabled',
  'emailEducatorCriticalEnabled',
  'emailEducatorNotifyEnabled',
  'emailEducatorBulkEnabled',
  'emailCandidateCriticalEnabled',
  'emailCandidateNotifyEnabled',
  'emailCandidateBulkEnabled',
  'emailStaffCriticalEnabled',
  'emailStaffNotifyEnabled',
] as const;

export type KillSwitchKey = (typeof ALLOWED_KEYS)[number];

export type SendWindowChanges = {
  emailSendWindowEnabled?: boolean;
  emailSendWindowStartHour?: number;
  emailSendWindowEndHour?: number;
  emailSendWindowTimezone?: string;
  emailSendWindowAppliesToCritical?: boolean;
};

export type ToggleKillSwitchInput = {
  actorId: string;
  changes: Partial<Record<KillSwitchKey, boolean>>;
  reason: string;
  clearAutoPause?: boolean;
  sendWindow?: SendWindowChanges;
};

/**
 * Granüler kill switch matrisi güncellemesi.
 * Her değişiklik AuditLog (`EMAIL_KILL_SWITCH_CHANGED`) ile loglanır.
 */
export class ToggleEmailKillSwitchUseCase {
  constructor(private readonly db: PrismaClient = prisma) {}

  async execute(input: ToggleKillSwitchInput) {
    if (!input.reason || input.reason.trim().length < 3) {
      throw Object.assign(new Error('Sebep zorunludur (en az 3 karakter)'), { status: 400 });
    }
    const cleanChanges: Record<string, boolean> = {};
    for (const k of Object.keys(input.changes) as KillSwitchKey[]) {
      if (!ALLOWED_KEYS.includes(k)) continue;
      const v = input.changes[k];
      if (typeof v === 'boolean') cleanChanges[k] = v;
    }
    const windowChanges = this.cleanWindowChanges(input.sendWindow);
    const hasWindowChange = Object.keys(windowChanges).length > 0;
    if (Object.keys(cleanChanges).length === 0 && !input.clearAutoPause && !hasWindowChange) {
      throw Object.assign(new Error('Hiçbir geçerli değişiklik yok'), { status: 400 });
    }

    const before = await this.db.adminSettings.findFirst({ where: { id: 1 } });
    if (!before) throw Object.assign(new Error('AdminSettings missing'), { status: 500 });

    // Pencere geçerliliğini doğrula (kısmi güncelleme için before + changes birleşimi)
    if (hasWindowChange) {
      const merged = {
        enabled:
          (windowChanges.emailSendWindowEnabled as boolean | undefined) ??
          before.emailSendWindowEnabled,
        startHour:
          (windowChanges.emailSendWindowStartHour as number | undefined) ??
          before.emailSendWindowStartHour,
        endHour:
          (windowChanges.emailSendWindowEndHour as number | undefined) ??
          before.emailSendWindowEndHour,
        timezone:
          (windowChanges.emailSendWindowTimezone as string | undefined) ??
          before.emailSendWindowTimezone,
      };
      if (merged.enabled && !isValidWindow(merged)) {
        throw Object.assign(
          new Error('Geçersiz saat penceresi: startHour 0-23, endHour 1-24, start < end'),
          { status: 400 },
        );
      }
    }

    const data: any = { ...cleanChanges, ...windowChanges };
    if (input.clearAutoPause) {
      data.emailBulkAutoPausedAt = null;
      data.emailBulkAutoPausedReason = null;
    }

    const after = await this.db.adminSettings.update({
      where: { id: 1 },
      data,
    });

    const diff: Record<string, { before: any; after: any }> = {};
    for (const k of [...Object.keys(cleanChanges), ...Object.keys(windowChanges)]) {
      diff[k] = { before: (before as any)[k], after: (after as any)[k] };
    }
    await this.db.auditLog.create({
      data: {
        action: 'EMAIL_KILL_SWITCH_CHANGED',
        entityType: 'AdminSettings',
        entityId: '1',
        actorId: input.actorId,
        metadata: {
          diff,
          reason: input.reason,
          clearAutoPause: !!input.clearAutoPause,
          windowUpdated: hasWindowChange,
        } as any,
      },
    });

    return after;
  }

  private cleanWindowChanges(w?: SendWindowChanges): Record<string, unknown> {
    if (!w) return {};
    const out: Record<string, unknown> = {};
    if (typeof w.emailSendWindowEnabled === 'boolean') out.emailSendWindowEnabled = w.emailSendWindowEnabled;
    if (Number.isInteger(w.emailSendWindowStartHour)) out.emailSendWindowStartHour = w.emailSendWindowStartHour;
    if (Number.isInteger(w.emailSendWindowEndHour)) out.emailSendWindowEndHour = w.emailSendWindowEndHour;
    if (typeof w.emailSendWindowTimezone === 'string' && w.emailSendWindowTimezone.trim().length > 0) {
      out.emailSendWindowTimezone = w.emailSendWindowTimezone.trim();
    }
    if (typeof w.emailSendWindowAppliesToCritical === 'boolean') {
      out.emailSendWindowAppliesToCritical = w.emailSendWindowAppliesToCritical;
    }
    return out;
  }
}
