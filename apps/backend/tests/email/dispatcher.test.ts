import { EmailDispatcher } from '../../src/application/services/email/EmailDispatcher';

type Settings = {
  emailEnabled: boolean;
  emailEducatorCriticalEnabled: boolean;
  emailEducatorNotifyEnabled: boolean;
  emailEducatorBulkEnabled: boolean;
  emailCandidateCriticalEnabled: boolean;
  emailCandidateNotifyEnabled: boolean;
  emailCandidateBulkEnabled: boolean;
  emailStaffCriticalEnabled: boolean;
  emailStaffNotifyEnabled: boolean;
  emailDailyCapPerUser: number;
};

function mkDb(overrides: {
  settings?: Partial<Settings>;
  suppression?: any;
  prefs?: Record<string, boolean>;
  countWithin24h?: number;
}) {
  const settings: Settings = {
    emailEnabled: true,
    emailEducatorCriticalEnabled: true,
    emailEducatorNotifyEnabled: true,
    emailEducatorBulkEnabled: true,
    emailCandidateCriticalEnabled: true,
    emailCandidateNotifyEnabled: true,
    emailCandidateBulkEnabled: true,
    emailStaffCriticalEnabled: true,
    emailStaffNotifyEnabled: true,
    emailDailyCapPerUser: 20,
    ...overrides.settings,
  };
  return {
    adminSettings: { findFirst: async () => settings },
    suppressedEmail: {
      findUnique: async () => overrides.suppression ?? null,
    },
    user: {
      findUnique: async () => ({ emailPreferences: overrides.prefs ?? {} }),
    },
    emailLog: {
      count: async () => overrides.countWithin24h ?? 0,
    },
  } as any;
}

const base = {
  tenantId: 't1',
  recipientUserId: 'u1',
  recipientEmail: 'foo@bar.com',
  templateKey: 'review-received',
};

describe('EmailDispatcher.shouldSend', () => {
  test('global kapalı → BLOCKED_BY_ADMIN', async () => {
    const d = new EmailDispatcher(mkDb({ settings: { emailEnabled: false } }));
    const r = await d.shouldSend({ ...base, queue: 'NOTIFY', recipientRole: 'CANDIDATE' });
    expect(r.status).toBe('BLOCKED_BY_ADMIN');
  });

  test('CANDIDATE NOTIFY off → BLOCKED_BY_ADMIN', async () => {
    const d = new EmailDispatcher(mkDb({ settings: { emailCandidateNotifyEnabled: false } }));
    const r = await d.shouldSend({ ...base, queue: 'NOTIFY', recipientRole: 'CANDIDATE' });
    expect(r.status).toBe('BLOCKED_BY_ADMIN');
    expect(r.reason).toContain('candidate:notify');
  });

  test('CANDIDATE CRITICAL preference yoksayılır', async () => {
    const d = new EmailDispatcher(
      mkDb({ prefs: { reviewNotifications: false, weeklyDigest: false } }),
    );
    const r = await d.shouldSend({
      ...base,
      templateKey: 'password-reset',
      queue: 'CRITICAL',
      recipientRole: 'CANDIDATE',
    });
    expect(r.status).toBe('ALLOWED');
  });

  test('SUPPRESSED → SUPPRESSED', async () => {
    const d = new EmailDispatcher(
      mkDb({ suppression: { reason: 'HARD_BOUNCE', expiresAt: null } }),
    );
    const r = await d.shouldSend({ ...base, queue: 'NOTIFY', recipientRole: 'CANDIDATE' });
    expect(r.status).toBe('SUPPRESSED');
  });

  test('Süresi geçmiş suppression → bypass', async () => {
    const d = new EmailDispatcher(
      mkDb({
        suppression: { reason: 'REPEATED_SOFT_BOUNCE', expiresAt: new Date(Date.now() - 1000) },
      }),
    );
    const r = await d.shouldSend({ ...base, queue: 'NOTIFY', recipientRole: 'CANDIDATE' });
    expect(r.status).toBe('ALLOWED');
  });

  test('NOTIFY + preference false → BLOCKED_BY_PREFS', async () => {
    const d = new EmailDispatcher(mkDb({ prefs: { reviewNotifications: false } }));
    const r = await d.shouldSend({ ...base, queue: 'NOTIFY', recipientRole: 'CANDIDATE' });
    expect(r.status).toBe('BLOCKED_BY_PREFS');
  });

  test('Günlük cap aşımı → BLOCKED_BY_PREFS', async () => {
    const d = new EmailDispatcher(mkDb({ countWithin24h: 999 }));
    const r = await d.shouldSend({ ...base, queue: 'NOTIFY', recipientRole: 'CANDIDATE' });
    expect(r.status).toBe('BLOCKED_BY_PREFS');
    expect(r.reason).toBe('daily_cap_reached');
  });

  test('Tüm kontroller geçti → ALLOWED', async () => {
    const d = new EmailDispatcher(mkDb({}));
    const r = await d.shouldSend({ ...base, queue: 'NOTIFY', recipientRole: 'CANDIDATE' });
    expect(r.status).toBe('ALLOWED');
  });
});
