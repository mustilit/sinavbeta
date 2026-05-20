import {
  DEFAULT_EMAIL_PREFERENCES,
  PREFERENCE_MAP,
  readEmailPreferences,
} from '../../src/application/services/email/preferenceMap';

describe('preferenceMap', () => {
  test('default keys match', () => {
    expect(DEFAULT_EMAIL_PREFERENCES).toMatchObject({
      marketing: false,
      productUpdates: true,
      weeklyDigest: true,
      reviewNotifications: true,
      objectionUpdates: true,
      liveSessionInvites: true,
      refundUpdates: true,
    });
  });

  test('CRITICAL şablonlar preference filtresi atlar (null map)', () => {
    expect(PREFERENCE_MAP['password-reset']).toBeNull();
    expect(PREFERENCE_MAP['purchase-receipt']).toBeNull();
    expect(PREFERENCE_MAP['refund-confirmation']).toBeNull();
  });

  test('NOTIFY/BULK şablonlar uygun preference key e bağlanır', () => {
    expect(PREFERENCE_MAP['weekly-digest']).toBe('weeklyDigest');
    expect(PREFERENCE_MAP['campaign-announcement']).toBe('marketing');
    expect(PREFERENCE_MAP['review-received']).toBe('reviewNotifications');
  });

  test('readEmailPreferences null/undefined → default', () => {
    expect(readEmailPreferences(null)).toEqual(DEFAULT_EMAIL_PREFERENCES);
    expect(readEmailPreferences(undefined)).toEqual(DEFAULT_EMAIL_PREFERENCES);
  });

  test('readEmailPreferences partial override', () => {
    const out = readEmailPreferences({ marketing: true, weeklyDigest: false });
    expect(out.marketing).toBe(true);
    expect(out.weeklyDigest).toBe(false);
    expect(out.productUpdates).toBe(true); // default korunur
  });

  test('readEmailPreferences yanlış tip alanları yoksayar', () => {
    const out = readEmailPreferences({ marketing: 'yes', refundUpdates: 0 } as any);
    expect(out.marketing).toBe(false);
    expect(out.refundUpdates).toBe(true);
  });
});
