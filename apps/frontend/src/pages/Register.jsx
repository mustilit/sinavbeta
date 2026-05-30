import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { auth } from '@/api/dalClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { createPageUrl } from '@/utils';
import { useAppNavigate } from '@/lib/navigation';
import { Link } from 'react-router-dom';
import GoogleSignInButton from '@/components/auth/GoogleSignInButton';
import TurnstileWidget from '@/components/auth/TurnstileWidget';
import { ContractAcceptDialog } from '@/components/auth/ContractAcceptDialog';
import { GraduationCap, Briefcase } from 'lucide-react';

export default function Register() {
  const { t } = useTranslation(['auth', 'common']);
  // Rol seçimi artık görünür ve değiştirilebilir (Sprint 16).
  // Başlangıç değeri ?role= parametresinden (Home CTA), yoksa 'candidate'.
  // Sessiz aday-varsayımı yerine kullanıcı seçimi her zaman ekranda.
  const [role, setRole] = useState(() => {
    const p = new URLSearchParams(window.location.search).get('role');
    return p === 'educator' ? 'educator' : 'candidate';
  });
  const isEducator = role === 'educator';

  // Rol değişince state + URL senkron (yenileme/geri tutarlı, paylaşılabilir link)
  const selectRole = (next) => {
    setRole(next);
    setError(null);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('role', next);
      window.history.replaceState({}, '', url);
    } catch {
      /* ignore — eski tarayıcı / SSR */
    }
  };

  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  // Eğitici kaydında zorunlu (aday için kullanılmaz)
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState(null);
  // Sprint 14/16 — Sözleşme onayı popup (ContractAcceptDialog) ile alınır.
  // "Kayıt Ol" tıklanınca dialog açılır; aktif sözleşmeler on-demand çekilir,
  // kullanıcı okuyup onaylayınca completeRegistration gerçek kaydı yapar.
  // Mount'ta tek-seferlik fetch + kalıcı dead-end kaldırıldı.
  const [showContractDialog, setShowContractDialog] = useState(false);
  const navigate = useAppNavigate();

  // "Kayıt Ol" → form alanları (HTML5 required) geçtiyse ÖNCE email/username uygunluğunu
  // kontrol et, sonra sözleşme dialog'unu aç. Kullanıcı çakışan email ile sözleşmeleri
  // okuyup onaylayıp sonradan "zaten kayıtlı" hatasıyla karşılaşmasın.
  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      const check = await auth.checkAvailability(email, username);
      if (!check.emailAvailable) {
        setError(t('auth:register.emailTaken', { defaultValue: 'Bu e-posta adresi zaten kayıtlı.' }));
        return;
      }
      if (!check.usernameAvailable) {
        setError(t('auth:register.usernameTaken', { defaultValue: 'Bu kullanıcı adı kullanılıyor.' }));
        return;
      }
    } catch {
      // Availability endpoint hatası → kullanıcıyı durdurmadan devam et (fail-open).
      // Gerçek kontrol kayıt isteğinde tekrar yapılır.
    }
    setShowContractDialog(true);
  };

  // Dialog'da iki sözleşme de onaylanınca gerçek kayıt isteği.
  const completeRegistration = async ({ termsId, privacyId }) => {
    setError(null);
    setLoading(true);
    try {
      if (isEducator) {
        await auth.registerEducator(email, username, password, {
          firstName,
          lastName,
          turnstileToken,
          acceptedEducatorContractId: termsId,
          acceptedPrivacyContractId: privacyId,
        });
        // Eğitici: doğrulama → login → EducatorOnboarding (CV + uzmanlık alanı zorunlu)
        navigate(createPageUrl('VerifyEmail') + `?email=${encodeURIComponent(email)}&role=educator`, { replace: true });
      } else {
        await auth.register(email, username, password, {
          turnstileToken,
          acceptedTermsContractId: termsId,
          acceptedPrivacyContractId: privacyId,
        });
        // Aday: e-posta doğrulama sayfasına yönlendir; doğrulama sonrası SelectExamTypes'a yönlendirilir
        navigate(createPageUrl('VerifyEmail') + `?email=${encodeURIComponent(email)}`, { replace: true });
      }
    } catch (err) {
      // Hata olursa dialog'u kapat ki form üzerindeki hata mesajı görünsün.
      setShowContractDialog(false);
      // Backend hata yanıtı iki farklı şekilde gelebilir:
      //   • Yeni format: { error: { code, message, details } }  → .error.message kullan
      //   • Eski format: { error: 'string' } veya { message: 'string' }
      // setError'a object koymak React render'ı patlatır ("Objects are not valid as a React child").
      const data = err?.response?.data;
      const msg =
        (typeof data?.error === 'string' ? data.error : data?.error?.message) ||
        data?.message ||
        t('auth:register.failed');
      setError(typeof msg === 'string' ? msg : t('auth:register.failed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-md">
        {/* Sınav Salonu marka başlığı */}
        <Link
          to={createPageUrl('Home')}
          className="flex items-center justify-center gap-3 mb-8"
          aria-label={t('auth:register.brandAriaLabel')}
        >
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-600 to-indigo-500 flex items-center justify-center shadow-md">
            <GraduationCap className="w-7 h-7 text-white" aria-hidden="true" />
          </div>
          <span className="text-2xl font-bold text-slate-900">{t('common:sidebar.brandName')}</span>
        </Link>
        <h1 className="text-2xl font-bold text-slate-900 mb-2 text-center">{t('auth:register.title')}</h1>

        {/* Sprint 16 — Görünür rol seçici (sessiz aday-varsayımı yerine).
            Aday/Eğitici her zaman ekranda; tek tıkla değişir, form ona göre uyarlanır. */}
        <div className="mb-6">
          <p className="text-sm font-medium text-slate-700 mb-2 text-center">
            {t('auth:register.roleSelect.label', { defaultValue: 'Nasıl kaydolmak istersiniz?' })}
          </p>
          <div className="grid grid-cols-2 gap-3">
            {[
              {
                val: 'candidate',
                label: t('auth:register.roleSelect.candidate', { defaultValue: 'Aday' }),
                desc: t('auth:register.roleSelect.candidateDesc', {
                  defaultValue: 'Test paketi satın al, çöz, skorunu takip et',
                }),
                Icon: GraduationCap,
              },
              {
                val: 'educator',
                label: t('auth:register.roleSelect.educator', { defaultValue: 'Eğitici' }),
                desc: t('auth:register.roleSelect.educatorDesc', {
                  defaultValue: 'Test ve paket oluştur, yayımla, sat',
                }),
                Icon: Briefcase,
              },
            ].map(({ val, label, desc, Icon }) => {
              const active = role === val;
              return (
                <button
                  key={val}
                  type="button"
                  onClick={() => selectRole(val)}
                  aria-pressed={active}
                  className={`p-4 rounded-xl border-2 text-left transition-all min-h-10 ${
                    active
                      ? 'border-indigo-500 bg-indigo-50'
                      : 'border-slate-200 hover:border-slate-300 bg-white'
                  }`}
                >
                  <Icon
                    className={`w-5 h-5 mb-2 ${active ? 'text-indigo-600' : 'text-slate-400'}`}
                    aria-hidden="true"
                  />
                  <p className="font-medium text-sm text-slate-900">{label}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{desc}</p>
                </button>
              );
            })}
          </div>
        </div>

        <form onSubmit={submit} className="space-y-4">
          {/* Eğitici kaydında ad ve soyad zorunlu — resmi kayıt için */}
          {isEducator && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="reg-first" className="block text-sm font-medium text-slate-700 mb-1">{t('auth:register.firstName')}</label>
                <Input
                  id="reg-first"
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder={t('auth:register.firstNamePlaceholder')}
                  required
                  minLength={2}
                  maxLength={50}
                  className="w-full"
                />
              </div>
              <div>
                <label htmlFor="reg-last" className="block text-sm font-medium text-slate-700 mb-1">{t('auth:register.lastName')}</label>
                <Input
                  id="reg-last"
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder={t('auth:register.lastNamePlaceholder')}
                  required
                  minLength={2}
                  maxLength={50}
                  className="w-full"
                />
              </div>
            </div>
          )}
          <div>
            <label htmlFor="reg-email" className="block text-sm font-medium text-slate-700 mb-1">{t('auth:register.email')}</label>
            <Input
              id="reg-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t('auth:register.emailPlaceholder')}
              required
              className="w-full"
            />
          </div>
          <div>
            <label htmlFor="reg-username" className="block text-sm font-medium text-slate-700 mb-1">{t('auth:register.username')}</label>
            <Input
              id="reg-username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder={t('auth:register.usernamePlaceholder')}
              required
              className="w-full"
            />
          </div>
          <div>
            <label htmlFor="reg-password" className="block text-sm font-medium text-slate-700 mb-1">{t('auth:register.password')}</label>
            <Input
              id="reg-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="w-full"
            />
          </div>
          {/* Sprint 16 — Sözleşme onayı "Kayıt Ol"dan sonra popup'ta (ContractAcceptDialog)
              alınır; metinler okunup onaylanmadan kayıt tamamlanmaz. */}
          <p className="text-xs text-slate-500">
            {t('auth:register.contractDialog.notice', {
              defaultValue:
                "Kayıt Ol'a bastığınızda üyelik ve KVKK aydınlatma metinlerini okuyup onaylamanız istenecek.",
            })}
          </p>
          {error && <p className="text-sm text-red-600">{error}</p>}
          {/* Bot doğrulaması — normal kullanıcıya görünmez; şüpheli aktivitede challenge */}
          <TurnstileWidget onSuccess={setTurnstileToken} action="register" />
          <Button
            type="submit"
            disabled={loading}
            className="w-full bg-indigo-600 hover:bg-indigo-700"
          >
            {loading ? t('auth:register.submitting') : t('auth:register.submit')}
          </Button>
        </form>

        {/* Sözleşme onay popup'ı — Kayıt Ol tıklanınca açılır, onay sonrası kayıt tamamlanır */}
        <ContractAcceptDialog
          open={showContractDialog}
          onOpenChange={setShowContractDialog}
          isEducator={isEducator}
          submitting={loading}
          onConfirm={completeRegistration}
        />

        {/* Google ile kayıt — yeni kullanıcı oluşturma role parametresine göre yapılır */}
        <div className="mt-6">
          <div className="relative my-4" aria-hidden="true">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-200" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-slate-50 px-2 text-slate-500">{t('common:common.or')}</span>
            </div>
          </div>
          <GoogleSignInButton
            text="signup_with"
            role={isEducator ? 'EDUCATOR' : 'CANDIDATE'}
          />
        </div>

        <p className="mt-4 text-center text-sm text-slate-600">
          {t('auth:register.haveAccount')}{' '}
          <Link to={createPageUrl('Login')} className="text-indigo-600 underline hover:no-underline">
            {t('auth:register.login')}
          </Link>
        </p>
        <p className="mt-2 text-center">
          <Link to={createPageUrl('Home')} className="text-sm text-slate-500 hover:text-slate-700">
            {t('auth:register.backToHome')}
          </Link>
        </p>
      </div>
    </div>
  );
}
