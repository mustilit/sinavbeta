import { EmailQueue, PrismaClient, UserRole } from '@prisma/client';
import { prisma } from '../../../infrastructure/database/prisma';
import { normalizeEmail } from './utils/emailNormalize';
import { PREFERENCE_MAP, readEmailPreferences } from './preferenceMap';

export type DispatchDecisionStatus =
  | 'ALLOWED'
  | 'BLOCKED_BY_ADMIN'
  | 'SUPPRESSED'
  | 'BLOCKED_BY_PREFS';

export type DispatchDecision = {
  status: DispatchDecisionStatus;
  reason?: string;
};

export type DispatchInput = {
  tenantId: string;
  recipientUserId?: string | null;
  recipientEmail: string;
  recipientRole?: UserRole | null;
  queue: EmailQueue;
  templateKey: string;
  bypassPreferences?: boolean;
};

const STAFF_ROLES: UserRole[] = ['ADMIN', 'WORKER'];

/**
 * shouldSend → gönderim öncesi filtre.
 * Sıra:
 * 1) AdminSettings.emailEnabled (global)
 * 2) Hedef rolüne + kuyruğa göre kill switch matrisi
 * 3) SuppressedEmail eşleşmesi
 * 4) NOTIFY/BULK → kullanıcı tercih kontrolü (CRITICAL atlanır)
 * 5) Günlük cap (CRITICAL atlanır)
 */
export class EmailDispatcher {
  constructor(private readonly db: PrismaClient = prisma) {}

  async shouldSend(input: DispatchInput): Promise<DispatchDecision> {
    // 1. Global switch
    const settings = await this.db.adminSettings.findFirst({
      where: { id: 1 },
    });
    if (settings && settings.emailEnabled === false) {
      return { status: 'BLOCKED_BY_ADMIN', reason: 'global_email_disabled' };
    }

    // 2. Matris (rol × kuyruk)
    const matrixDecision = this.checkMatrix(settings, input);
    if (matrixDecision.status !== 'ALLOWED') return matrixDecision;

    // 3. Suppression
    const supp = await this.db.suppressedEmail.findUnique({
      where: {
        tenantId_email: {
          tenantId: input.tenantId,
          email: normalizeEmail(input.recipientEmail),
        },
      },
    });
    if (supp) {
      const stillActive = !supp.expiresAt || supp.expiresAt > new Date();
      if (stillActive) {
        return { status: 'SUPPRESSED', reason: `suppression:${supp.reason}` };
      }
    }

    // CRITICAL kuyruğu prefs ve daily cap'i atlar
    if (input.queue === 'CRITICAL' || input.bypassPreferences) {
      return { status: 'ALLOWED' };
    }

    // 4. Kullanıcı tercihi
    if (input.recipientUserId) {
      const prefField = PREFERENCE_MAP[input.templateKey];
      if (prefField !== undefined && prefField !== null) {
        const user = await this.db.user.findUnique({
          where: { id: input.recipientUserId },
          select: { emailPreferences: true },
        });
        const prefs = readEmailPreferences(user?.emailPreferences);
        if (prefs[prefField] === false) {
          return { status: 'BLOCKED_BY_PREFS', reason: `pref:${prefField}` };
        }
      }
    }

    // 5. Günlük cap
    if (input.recipientUserId && settings) {
      const cap = settings.emailDailyCapPerUser ?? 20;
      if (cap > 0) {
        const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const count = await this.db.emailLog.count({
          where: {
            tenantId: input.tenantId,
            recipientUserId: input.recipientUserId,
            queue: { not: 'CRITICAL' },
            queuedAt: { gt: since },
            status: { in: ['QUEUED', 'SENDING', 'SENT', 'DELIVERED'] },
          },
        });
        if (count >= cap) {
          return { status: 'BLOCKED_BY_PREFS', reason: 'daily_cap_reached' };
        }
      }
    }

    return { status: 'ALLOWED' };
  }

  private checkMatrix(
    settings: {
      emailEducatorCriticalEnabled: boolean;
      emailEducatorNotifyEnabled: boolean;
      emailEducatorBulkEnabled: boolean;
      emailCandidateCriticalEnabled: boolean;
      emailCandidateNotifyEnabled: boolean;
      emailCandidateBulkEnabled: boolean;
      emailStaffCriticalEnabled: boolean;
      emailStaffNotifyEnabled: boolean;
    } | null,
    input: DispatchInput,
  ): DispatchDecision {
    if (!settings) return { status: 'ALLOWED' };
    const role = input.recipientRole;
    if (!role) return { status: 'ALLOWED' };
    const q = input.queue;
    let flag = true;
    let label = '';
    if (role === 'EDUCATOR') {
      label = 'educator';
      flag =
        q === 'CRITICAL'
          ? settings.emailEducatorCriticalEnabled
          : q === 'NOTIFY'
            ? settings.emailEducatorNotifyEnabled
            : settings.emailEducatorBulkEnabled;
    } else if (role === 'CANDIDATE') {
      label = 'candidate';
      flag =
        q === 'CRITICAL'
          ? settings.emailCandidateCriticalEnabled
          : q === 'NOTIFY'
            ? settings.emailCandidateNotifyEnabled
            : settings.emailCandidateBulkEnabled;
    } else if (STAFF_ROLES.includes(role)) {
      label = 'staff';
      if (q === 'BULK') return { status: 'ALLOWED' };
      flag = q === 'CRITICAL' ? settings.emailStaffCriticalEnabled : settings.emailStaffNotifyEnabled;
    }
    if (!flag) {
      return { status: 'BLOCKED_BY_ADMIN', reason: `matrix:${label}:${q.toLowerCase()}` };
    }
    return { status: 'ALLOWED' };
  }
}

let _dispatcher: EmailDispatcher | null = null;
export function getEmailDispatcher(): EmailDispatcher {
  if (!_dispatcher) _dispatcher = new EmailDispatcher();
  return _dispatcher;
}
