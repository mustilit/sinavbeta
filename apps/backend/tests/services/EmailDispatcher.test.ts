/**
 * EmailDispatcher.shouldSend unit testleri.
 * Tüm Prisma çağrıları mock DB ile izole edilir.
 */
import { EmailDispatcher } from '../../src/application/services/email/EmailDispatcher';

const makeSettings = (overrides: Partial<any> = {}) => ({
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
  ...overrides,
});

const makeInput = (overrides: Partial<any> = {}) => ({
  tenantId: 'tenant-1',
  recipientUserId: 'user-1',
  recipientEmail: 'user@example.com',
  recipientRole: 'CANDIDATE',
  queue: 'NOTIFY',
  templateKey: 'review-received',
  ...overrides,
});

describe('EmailDispatcher.shouldSend', () => {
  let mockDb: any;
  let dispatcher: EmailDispatcher;

  beforeEach(() => {
    mockDb = {
      adminSettings: { findFirst: jest.fn() },
      suppressedEmail: { findUnique: jest.fn().mockResolvedValue(null) },
      user: { findUnique: jest.fn() },
      emailLog: { count: jest.fn().mockResolvedValue(0) },
    };
    dispatcher = new EmailDispatcher(mockDb);
  });

  // --- Global switch ---

  describe('global emailEnabled = false', () => {
    it('global switch kapalıysa BLOCKED_BY_ADMIN döner', async () => {
      mockDb.adminSettings.findFirst.mockResolvedValueOnce(
        makeSettings({ emailEnabled: false }),
      );
      const result = await dispatcher.shouldSend(makeInput());
      expect(result.status).toBe('BLOCKED_BY_ADMIN');
      expect(result.reason).toBe('global_email_disabled');
    });
  });

  // --- Matrix checks ---

  describe('kill switch matrix', () => {
    it('candidate NOTIFY devre dışıysa BLOCKED_BY_ADMIN döner', async () => {
      mockDb.adminSettings.findFirst.mockResolvedValueOnce(
        makeSettings({ emailCandidateNotifyEnabled: false }),
      );
      const result = await dispatcher.shouldSend(makeInput({ queue: 'NOTIFY', recipientRole: 'CANDIDATE' }));
      expect(result.status).toBe('BLOCKED_BY_ADMIN');
      expect(result.reason).toContain('candidate:notify');
    });

    it('educator CRITICAL kapalı olsa bile BLOCKED_BY_ADMIN döner', async () => {
      mockDb.adminSettings.findFirst.mockResolvedValueOnce(
        makeSettings({ emailEducatorCriticalEnabled: false }),
      );
      const result = await dispatcher.shouldSend(
        makeInput({ queue: 'CRITICAL', recipientRole: 'EDUCATOR' }),
      );
      expect(result.status).toBe('BLOCKED_BY_ADMIN');
    });

    it('settings yoksa matrix atlanır ve ALLOWED döner', async () => {
      mockDb.adminSettings.findFirst.mockResolvedValueOnce(null);
      const result = await dispatcher.shouldSend(makeInput());
      expect(result.status).toBe('ALLOWED');
    });
  });

  // --- Suppression ---

  describe('suppression listesi', () => {
    it('aktif suppression kaydı varsa SUPPRESSED döner', async () => {
      mockDb.adminSettings.findFirst.mockResolvedValueOnce(makeSettings());
      mockDb.suppressedEmail.findUnique.mockResolvedValueOnce({
        email: 'user@example.com',
        reason: 'HARD_BOUNCE',
        expiresAt: null, // kalıcı
      });

      const result = await dispatcher.shouldSend(makeInput());

      expect(result.status).toBe('SUPPRESSED');
      expect(result.reason).toContain('HARD_BOUNCE');
    });

    it('expiresAt geçmişte ise suppression aktif sayılmaz ve ALLOWED döner', async () => {
      mockDb.adminSettings.findFirst.mockResolvedValueOnce(makeSettings());
      mockDb.suppressedEmail.findUnique.mockResolvedValueOnce({
        email: 'user@example.com',
        reason: 'SOFT_BOUNCE',
        expiresAt: new Date(Date.now() - 1000), // geçmişte
      });
      mockDb.user.findUnique.mockResolvedValueOnce({ emailPreferences: {} });

      const result = await dispatcher.shouldSend(makeInput());
      expect(result.status).toBe('ALLOWED');
    });
  });

  // --- CRITICAL bypass ---

  describe('CRITICAL queue preference bypass', () => {
    it('CRITICAL kuyrukta kullanıcı tercihi ve daily cap atlanır', async () => {
      mockDb.adminSettings.findFirst.mockResolvedValueOnce(makeSettings());

      const result = await dispatcher.shouldSend(
        makeInput({
          queue: 'CRITICAL',
          templateKey: 'password-reset',
        }),
      );

      expect(result.status).toBe('ALLOWED');
      expect(mockDb.user.findUnique).not.toHaveBeenCalled();
      expect(mockDb.emailLog.count).not.toHaveBeenCalled();
    });
  });

  // --- User preferences ---

  describe('kullanıcı tercihleri', () => {
    it('marketing tercihi kapalıysa BULK campaign BLOCKED_BY_PREFS döner', async () => {
      mockDb.adminSettings.findFirst.mockResolvedValueOnce(makeSettings());
      mockDb.user.findUnique.mockResolvedValueOnce({
        emailPreferences: { marketing: false },
      });

      const result = await dispatcher.shouldSend(
        makeInput({ queue: 'BULK', templateKey: 'campaign-announcement' }),
      );

      expect(result.status).toBe('BLOCKED_BY_PREFS');
      expect(result.reason).toBe('pref:marketing');
    });

    it('tercihi açık olan kullanıcıya ALLOWED döner', async () => {
      mockDb.adminSettings.findFirst.mockResolvedValueOnce(makeSettings());
      mockDb.user.findUnique.mockResolvedValueOnce({
        emailPreferences: { reviewNotifications: true },
      });

      const result = await dispatcher.shouldSend(
        makeInput({ queue: 'NOTIFY', templateKey: 'review-received' }),
      );

      expect(result.status).toBe('ALLOWED');
    });
  });

  // --- Daily cap ---

  describe('günlük cap', () => {
    it('cap dolduğunda BLOCKED_BY_PREFS döner', async () => {
      mockDb.adminSettings.findFirst.mockResolvedValueOnce(makeSettings({ emailDailyCapPerUser: 20 }));
      mockDb.user.findUnique.mockResolvedValueOnce({ emailPreferences: {} });
      mockDb.emailLog.count.mockResolvedValueOnce(20); // limit doldu

      const result = await dispatcher.shouldSend(makeInput());

      expect(result.status).toBe('BLOCKED_BY_PREFS');
      expect(result.reason).toBe('daily_cap_reached');
    });

    it('cap dolmamışsa ALLOWED döner', async () => {
      mockDb.adminSettings.findFirst.mockResolvedValueOnce(makeSettings({ emailDailyCapPerUser: 20 }));
      mockDb.user.findUnique.mockResolvedValueOnce({ emailPreferences: {} });
      mockDb.emailLog.count.mockResolvedValueOnce(5);

      const result = await dispatcher.shouldSend(makeInput());
      expect(result.status).toBe('ALLOWED');
    });
  });
});
