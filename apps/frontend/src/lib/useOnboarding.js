/**
 * useOnboarding - Kullanıcı onboarding tur durumunu yönetir.
 *
 * Tur anahtarları (user preferences JSON'a kaydedilir):
 *   ob_cand_welcome  - Aday karşılama turu
 *   ob_cand_test     - Aday test çözme turu
 *   ob_edu_welcome   - Eğitici karşılama turu
 *   ob_edu_create    - Eğitici test oluşturma turu
 */
import { useCallback, useEffect } from 'react';
import api from '@/lib/api/apiClient';
import { useAuth } from '@/lib/AuthContext';

export const TOUR_KEYS = {
  CANDIDATE_WELCOME: 'ob_cand_welcome',
  CANDIDATE_TEST: 'ob_cand_test',
  EDUCATOR_WELCOME: 'ob_edu_welcome',
  EDUCATOR_CREATE: 'ob_edu_create',
  // E-Sınıf rol bazlı bilgilendirme turları
  SCHOOL_STUDENT: 'ob_school_student',
  SCHOOL_TEACHER: 'ob_school_teacher',
  SCHOOL_ADMIN: 'ob_school_admin',
};

/** sessionStorage anahtarı — mevcut oturumda tamamlananları tut */
const SESSION_KEY = 'dal_completed_tours';
/** localStorage prefix — bu cihazda kalıcı "görüldü" işareti (flicker engeli) */
const LOCAL_PREFIX = 'dal_tour_done_';

function getSessionCompleted() {
  try {
    return JSON.parse(sessionStorage.getItem(SESSION_KEY) || '{}');
  } catch {
    return {};
  }
}

function markSessionCompleted(tourKey) {
  try {
    const current = getSessionCompleted();
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ ...current, [tourKey]: true }));
  } catch {}
}

function getLocalDone(tourKey) {
  try {
    return localStorage.getItem(LOCAL_PREFIX + tourKey) === '1';
  } catch {
    return false;
  }
}

function markLocalDone(tourKey) {
  try {
    localStorage.setItem(LOCAL_PREFIX + tourKey, '1');
  } catch {}
}

/**
 * Verilen tur görünmeli mi?
 *
 * FLICKER ENGELİ: Tur durumu `user` nesnesinden okunuyor; navigasyon/geçişlerde
 * `user` bir an preferences'sız (kısmi) gelirse gate yanlışlıkla `true` dönüp
 * tur'u bir saniyeliğine flash ederdi. Çözüm: bu cihazda bir kez "görüldü"
 * bilgisini localStorage'a yazıp ÖNCE oradan okuruz (senkron, user titremesinden
 * bağımsız). Backend pref'i true gelince de yerel önbelleğe kopyalanır.
 */
export function useShouldShowTour(tourKey) {
  const { user, isAuthenticated, isLoadingAuth } = useAuth();

  // Backend pref'i true ise yerel önbelleğe yaz → bir daha asla flash etmez.
  useEffect(() => {
    if (user && user[tourKey]) markLocalDone(tourKey);
  }, [user, tourKey]);

  // Auth henüz yükleniyorsa karar verme (geçici yanlış-pozitif flash'ı önle)
  if (isLoadingAuth) return false;
  if (!isAuthenticated || !user) return false;
  // Bu cihazda daha önce görüldü/tamamlandı → asla gösterme (flicker engeli)
  if (getLocalDone(tourKey)) return false;
  // preferences merge edilmiş user nesnesinden oku
  if (user[tourKey]) return false;
  // Bu session'da tamamlandıysa da gösterme
  if (getSessionCompleted()[tourKey]) return false;
  return true;
}

/**
 * Bir turu tamamlandı olarak işaretler.
 * Session + localStorage'a yazar (anlık/kalıcı yerel) + backend preferences (kalıcı).
 */
export function useCompleteTour() {
  const { user } = useAuth();

  return useCallback(async (tourKey) => {
    if (!user) return;
    // Hemen yerel işaretle (aynı session + bu cihazda tekrar açılmasın/flash etmesin)
    markSessionCompleted(tourKey);
    markLocalDone(tourKey);
    // Backend'e kaydet (fail-safe)
    try {
      await api.patch('/me/preferences', { [tourKey]: true });
    } catch {
      // Sessizce geç — bir sonraki girişte tekrar gösterilebilir
    }
  }, [user]);
}
