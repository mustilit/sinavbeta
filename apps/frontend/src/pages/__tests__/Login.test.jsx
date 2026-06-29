import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/schoolRender';
import Login from '../Login';

vi.mock('@/lib/AuthContext', () => ({ useAuth: () => ({ login: vi.fn() }) }));
vi.mock('@/lib/navigation', () => ({ useAppNavigate: () => vi.fn() }));
vi.mock('@/components/auth/GoogleSignInButton', () => ({ default: () => <div data-testid="google" /> }));
vi.mock('@/components/auth/TurnstileWidget', () => ({ default: () => <div data-testid="turnstile" /> }));
// t: anahtar yoksa defaultValue, varsa anahtarı döndür (deterministik)
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key, opts) => (opts && opts.defaultValue) || key, i18n: { changeLanguage: vi.fn() } }),
}));

beforeEach(() => vi.clearAllMocks());

describe('Login — E-Sınıf (context=school) farkları', () => {
  it('okul girişi: E-Sınıf Kapısı başlığı + İşbirliği/Demo + Kayıt ol yok', () => {
    renderWithProviders(<Login />, { route: '/Login?from=%2FHome&context=school' });
    expect(screen.getByRole('heading', { name: 'E-Sınıf Kapısı' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'İşbirliği/Demo için' })).toBeInTheDocument();
    // Şifremi unuttum + Kayıt ol + Google/veya yok
    expect(screen.queryByText('auth:login.forgotPassword')).toBeNull();
    expect(screen.queryByText('auth:login.createAccount')).toBeNull();
    expect(screen.queryByTestId('google')).toBeNull();
  });

  it('marketplace girişi (context yok): klasik Giriş Yap + Şifremi unuttum + Kayıt ol', () => {
    renderWithProviders(<Login />, { route: '/Login' });
    expect(screen.getByRole('heading', { name: 'auth:login.title' })).toBeInTheDocument();
    expect(screen.getByText('auth:login.forgotPassword')).toBeInTheDocument();
    expect(screen.getByText('auth:login.createAccount')).toBeInTheDocument();
    expect(screen.getByTestId('google')).toBeInTheDocument();
    expect(screen.queryByText('İşbirliği/Demo için')).toBeNull();
  });
});
