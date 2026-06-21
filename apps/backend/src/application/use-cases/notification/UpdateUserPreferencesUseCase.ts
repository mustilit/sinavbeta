import { AppError } from '../../errors/AppError';
import type { IUserPreferenceRepository } from '../../../domain/interfaces/IUserPreferenceRepository';
import { encryptStoredSecret, decryptStoredSecret } from '../../services/security/SecretsVault';

/**
 * UserPreference JSON içinde rest'te (DB'de) şifrelenmesi gereken hassas
 * iletişim/finans alanları. Owner GET'inde decrypt edilir; başkasının
 * gördüğü endpoint'ler (örn. public educator profile) bu alanları zaten
 * döndürmez.
 */
const PII_FIELDS = new Set(['phone', 'iban', 'bankName', 'accountHolder']);

/**
 * Bir preferences nesnesindeki hassas alanları şifreleyerek yeni nesne döner.
 * String olmayan ya da zaten şifreli alanlar olduğu gibi bırakılır.
 */
export function encryptPreferencesPII(prefs: Record<string, unknown> | null | undefined): Record<string, unknown> {
  if (!prefs) return {};
  const out: Record<string, unknown> = { ...prefs };
  for (const f of PII_FIELDS) {
    const v = out[f];
    if (typeof v === 'string' && v.trim()) {
      out[f] = encryptStoredSecret(v);
    } else if (v === null || v === '') {
      out[f] = null;
    }
  }
  return out;
}

/**
 * DB'den okunan preferences'ı UI için decrypt eder. Owner GET'inde çağrılır.
 */
export function decryptPreferencesPII(prefs: Record<string, unknown> | null | undefined): Record<string, unknown> {
  if (!prefs) return {};
  const out: Record<string, unknown> = { ...prefs };
  for (const f of PII_FIELDS) {
    const v = out[f];
    if (typeof v === 'string' && v) {
      const decrypted = decryptStoredSecret(v);
      out[f] = decrypted ?? '';
    }
  }
  return out;
}

/**
 * Güvenli güncelleme için izin verilen preferences alanları.
 * Bu listede olmayan hiçbir anahtar işlenmez — injection ve yetki yükseltme engellenir.
 * Yeni alan eklenecekse buraya da eklenmeli.
 */
const WHITELIST = [
  'theme', 'layout', 'fontSize', 'sidebarCollapsed',
  'phone', 'city', 'website', 'linkedin', 'interested_exam_types', 'notification_preferences',
  'education', 'bio', 'google_scholar_url', 'cv_url', 'profile_image_url', 'specialized_exam_types', 'specialized_grade_levels',
  'educator_status', 'rejection_reason', 'role',
  'iban', 'bankName', 'accountHolder',
  // Onboarding tur tamamlama bayrakları
  'ob_cand_welcome', 'ob_cand_test', 'ob_edu_welcome', 'ob_edu_create',
];

/**
 * Hassas iletişim alanları — yalnızca OTP doğrulamasından geçtikten sonra
 * uygulanır. Doğrudan PATCH /me/preferences çağrısı bunları görmezden gelir.
 * VerifySensitiveProfileChangeUseCase `allowSensitive: true` flag'i ile
 * UpdateUserPreferencesUseCase'i çağırır.
 */
const SENSITIVE_FIELDS = new Set(['phone', 'website', 'linkedin']);

/**
 * Kullanıcı tercihlerini günceller. Sadece WHITELIST'teki alanlar işlenir.
 * Mevcut preferences ile merge edilir (patch semantiği — tam üzerine yazmaz).
 *
 * @param options.allowSensitive default false. Sadece OTP-doğrulanmış akıştan
 *   çağrılırken true verilir; aksi halde phone/website/linkedin sessiz strip edilir.
 */
export class UpdateUserPreferencesUseCase {
  constructor(private readonly repo: IUserPreferenceRepository) {}

  async execute(
    userId: string | undefined,
    input: Record<string, unknown>,
    options: { allowSensitive?: boolean } = {},
  ): Promise<Record<string, unknown>> {
    if (!userId) throw new AppError('UNAUTHORIZED', 'Authentication required', 401);
    const allowSensitive = options.allowSensitive === true;

    // Whitelist dışındaki anahtarları + (OTP'siz çağrıda) hassas alanları filtrele
    const filtered: Record<string, unknown> = {};
    for (const k of Object.keys(input)) {
      if (!WHITELIST.includes(k)) continue;
      if (!allowSensitive && SENSITIVE_FIELDS.has(k)) continue;
      filtered[k] = input[k];
    }
    // Güncellenecek geçerli alan yoksa mevcut preferences'ı döndür
    if (Object.keys(filtered).length === 0) {
      const existing = await this.repo.findByUserId(userId);
      return existing?.preferences ?? {};
    }

    const existing = await this.repo.findByUserId(userId);
    // Mevcut değerleri koru; yeni değerleri üstüne ekle (deep merge değil, shallow merge)
    const merged = { ...(existing?.preferences ?? {}), ...filtered };
    // PII alanları (phone/iban/bankName/accountHolder) AES-GCM ile şifrelenir
    // — DB sızıntısında plain okunamaz. Owner GET endpoint'leri decrypt eder.
    const encryptedMerged = encryptPreferencesPII(merged);
    const updated = await this.repo.upsert(userId, encryptedMerged);
    // Owner'a geri dönerken decrypt et — kullanıcı kendi telefonunu/ibanını formda görebilsin
    return decryptPreferencesPII(updated.preferences);
  }
}
