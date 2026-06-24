import { useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/lib/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { createPageUrl } from '@/utils';
import { useAppNavigate } from '@/lib/navigation';
import { toSafeMessage } from '@/lib/api/errors';
import GoogleSignInButton from '@/components/auth/GoogleSignInButton';
import TurnstileWidget from '@/components/auth/TurnstileWidget';
import { GraduationCap } from 'lucide-react';

export default function Login() {
  const { t } = useTranslation(['auth', 'common']);
  const [searchParams] = useSearchParams();
  // Email pre-fill (VerifyEmail success akışında veya kayıt linkinde gelir)
  const emailFromQuery = searchParams.get('email') ?? '';
  const [email, setEmail] = useState(emailFromQuery);
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [turnstileToken, setTurnstileToken] = useState(null);
  const [loading, setLoading] = useState(false);
  // Başka cihazda giriş yapıldığında JwtAuthGuard SESSION_REPLACED döner;
  // apiClient kullanıcıyı buraya ?reason=session_replaced ile yönlendirir.
  const sessionReplaced = searchParams.get('reason') === 'session_replaced';
  const rawFrom = searchParams.get('from');
  // next: VerifyEmail başarısından sonra "SelectExamTypes" gibi onboarding hedefi olabilir.
  // Sadece bilinen page name'ler whitelist'lenir — open redirect koruması.
  const ALLOWED_NEXT = new Set(['SelectExamTypes', 'CompleteProfile', 'EducatorOnboarding', 'Home', 'Explore']);
  const nextParam = searchParams.get('next');
  const safeNextPage = nextParam && ALLOWED_NEXT.has(nextParam) ? nextParam : null;
  // Open redirect koruması: sadece / ile başlayan, // içermeyen, Login/Register olmayan path'ler
  const safeFrom = rawFrom &&
    rawFrom.startsWith('/') &&
    !rawFrom.startsWith('//') &&
    !/^\/(Login|Register|VerifyEmail)/i.test(rawFrom)
    ? rawFrom
    : null;
  const { login } = useAuth();
  const navigate = useAppNavigate();

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const loggedIn = await login(email, password, { turnstileToken });
      // E-Sınıf (okul) kullanıcısı → okul paneline yönlendir (marketplace home değil).
      if (loggedIn?.school?.schoolRole) {
        navigate(createPageUrl('SchoolPanel'), { replace: true });
        return;
      }
      // Öncelik sırası: ?next= (whitelist) > ?from= (open redirect korumalı) > Home
      const target = safeNextPage
        ? createPageUrl(safeNextPage)
        : safeFrom || createPageUrl('Home');
      navigate(target, { replace: true });
    } catch (err) {
      setLoading(false);
      const safe = toSafeMessage(err, { isProd: import.meta.env?.PROD });
      setError(safe || t('auth:login.failed'));
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4" data-testid="login-page">
      <div className="w-full max-w-md">
        {/* Sınav Salonu marka başlığı */}
        <Link
          to={createPageUrl('Home')}
          className="flex items-center justify-center gap-3 mb-8"
          aria-label={t('auth:login.brandAriaLabel')}
        >
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-600 to-indigo-500 flex items-center justify-center shadow-md">
            <GraduationCap className="w-7 h-7 text-white" aria-hidden="true" />
          </div>
          <span className="text-2xl font-bold text-slate-900">{t('common:sidebar.brandName')}</span>
        </Link>
        <h1 className="text-2xl font-bold text-slate-900 mb-6 text-center">{t('auth:login.title')}</h1>
        {sessionReplaced && (
          <div
            role="alert"
            className="mb-4 px-4 py-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-900"
          >
            {t('auth:login.sessionReplaced')}
          </div>
        )}
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label htmlFor="login-email" className="block text-sm font-medium text-slate-700 mb-1">{t('auth:login.email')}</label>
            <Input
              id="login-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t('auth:login.emailPlaceholder')}
              required
              className="w-full"
            />
          </div>
          <div>
            <label htmlFor="login-password" className="block text-sm font-medium text-slate-700 mb-1">{t('auth:login.password')}</label>
            <Input
              id="login-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full"
              // Chrome/Firefox parola yöneticilerinin kayıtlı şifreyi otomatik
              // doldurmasını engelle. `current-password` veya boş bırakmak
              // genellikle yine doldurmasına izin verir; `new-password`
              // tarayıcıyı "burada yeni bir şifre giriliyor" diye yönlendirip
              // mevcut kayıtları getirmemesini sağlar.
              autoComplete="new-password"
              // Bazı sürümlerde otomatik doldurma fontunu/arka planını de
              // ezer; ek tedbir
              data-form-type="other"
            />
          </div>
          <div className="flex justify-end">
            <Link to={createPageUrl('ForgotPassword')} className="text-sm text-indigo-600 hover:underline">
              {t('auth:login.forgotPassword')}
            </Link>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          {/* Bot doğrulaması — normal kullanıcıya görünmez; şüpheli aktivitede challenge */}
          <TurnstileWidget onSuccess={setTurnstileToken} action="login" />
          <Button type="submit" disabled={loading} className="w-full bg-indigo-600 hover:bg-indigo-700">
            {loading ? t('auth:login.submitting') : t('auth:login.submit')}
          </Button>
        </form>

        {/* Google ile giriş — VITE_GOOGLE_CLIENT_ID yoksa component otomatik gizlenir */}
        <div className="mt-6">
          <div className="relative my-4" aria-hidden="true">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-200" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-slate-50 px-2 text-slate-500">{t('common:common.or')}</span>
            </div>
          </div>
          <GoogleSignInButton text="signin_with" safeFrom={safeFrom} />
        </div>

        <p className="mt-4 text-center text-sm text-slate-600">
          {t('auth:login.noAccount')}{' '}
          <Link to={createPageUrl('Register')} className="text-indigo-600 underline hover:no-underline">
            {t('auth:login.createAccount')}
          </Link>
        </p>
        <p className="mt-2 text-center">
          <Link to={createPageUrl('Home')} className="text-sm text-slate-500 hover:text-slate-700">
            {t('auth:login.backToHome')}
          </Link>
        </p>
      </div>
    </div>
  );
}
