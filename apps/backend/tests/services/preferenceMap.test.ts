/**
 * preferenceMap utility testleri.
 * readEmailPreferences ve PREFERENCE_MAP saf fonksiyonlar — mock gerekmez.
 */
import {
  readEmailPreferences,
  DEFAULT_EMAIL_PREFERENCES,
  PREFERENCE_MAP,
} from '../../src/application/services/email/preferenceMap';

describe('preferenceMap', () => {
  // --- readEmailPreferences ---

  describe('readEmailPreferences', () => {
    it('null/undefined geçildiğinde default değerleri döner', () => {
      expect(readEmailPreferences(null)).toEqual(DEFAULT_EMAIL_PREFERENCES);
      expect(readEmailPreferences(undefined)).toEqual(DEFAULT_EMAIL_PREFERENCES);
    });

    it('string geçildiğinde default döner', () => {
      expect(readEmailPreferences('invalid')).toEqual(DEFAULT_EMAIL_PREFERENCES);
    });

    it('kısmi nesne eksik alanları default ile tamamlar', () => {
      const partial = { marketing: true };
      const result = readEmailPreferences(partial);
      expect(result.marketing).toBe(true);
      expect(result.weeklyDigest).toBe(DEFAULT_EMAIL_PREFERENCES.weeklyDigest);
      expect(result.productUpdates).toBe(DEFAULT_EMAIL_PREFERENCES.productUpdates);
    });

    it('tüm alanlar false geçilirse false kalır', () => {
      const allFalse = Object.fromEntries(
        Object.keys(DEFAULT_EMAIL_PREFERENCES).map((k) => [k, false]),
      );
      const result = readEmailPreferences(allFalse);
      for (const key of Object.keys(DEFAULT_EMAIL_PREFERENCES) as Array<keyof typeof DEFAULT_EMAIL_PREFERENCES>) {
        expect(result[key]).toBe(false);
      }
    });

    it('boolean olmayan değerler görmezden gelinir, default kalır', () => {
      const weird = { marketing: 'yes', weeklyDigest: 1, productUpdates: null };
      const result = readEmailPreferences(weird);
      // 'yes', 1, null boolean değil → default kullanılır
      expect(result.marketing).toBe(DEFAULT_EMAIL_PREFERENCES.marketing);
      expect(result.weeklyDigest).toBe(DEFAULT_EMAIL_PREFERENCES.weeklyDigest);
    });
  });

  // --- PREFERENCE_MAP ---

  describe('PREFERENCE_MAP', () => {
    it('CRITICAL şablonlar null (override yok) olarak eşlenmiş', () => {
      expect(PREFERENCE_MAP['password-reset']).toBeNull();
      expect(PREFERENCE_MAP['purchase-receipt']).toBeNull();
      expect(PREFERENCE_MAP['refund-confirmation']).toBeNull();
      expect(PREFERENCE_MAP['email-verification']).toBeNull();
      expect(PREFERENCE_MAP['account-security-alert']).toBeNull();
    });

    it('NOTIFY/BULK şablonları bir preference alanına eşlenmiş', () => {
      expect(PREFERENCE_MAP['review-received']).toBe('reviewNotifications');
      expect(PREFERENCE_MAP['weekly-digest']).toBe('weeklyDigest');
      expect(PREFERENCE_MAP['campaign-announcement']).toBe('marketing');
      expect(PREFERENCE_MAP['live-session-invite']).toBe('liveSessionInvites');
    });
  });
});
