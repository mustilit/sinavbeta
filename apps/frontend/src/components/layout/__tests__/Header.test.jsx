/**
 * PublicHeader bileşeni unit testleri
 * Kapsam: nav linkleri, dil seçici, login butonu, auth durumu
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { MemoryRouter } from 'react-router-dom';
import PublicHeader from '../../layout/PublicHeader';

const mockNavigate = vi.fn();

vi.mock('@/lib/AuthContext', () => ({
  useAuth: () => ({ user: null }),
}));

vi.mock('@/lib/navigation', () => ({
  useAppNavigate: () => mockNavigate,
  buildPageUrl: (name, query) => {
    const base = `/${name}`;
    if (!query) return base;
    const qs = new URLSearchParams(query).toString();
    return qs ? `${base}?${qs}` : base;
  },
}));

vi.mock('@/utils', () => ({
  createPageUrl: (name) => `/${name}`,
}));

vi.mock('@/components/layout/LanguageSwitcherCompact', () => ({
  LanguageSwitcherCompact: () => <div data-testid="lang-switcher" />,
}));

function renderHeader(user = null) {
  vi.doMock('@/lib/AuthContext', () => ({ useAuth: () => ({ user }) }));
  return render(
    <MemoryRouter>
      <PublicHeader />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('PublicHeader bileşeni', () => {
  it('header render edilir', () => {
    // Arrange & Act
    renderHeader();
    // Assert
    expect(screen.getByRole('banner')).toBeInTheDocument();
  });

  it('marka logosu / ana sayfa linki mevcut', () => {
    // Arrange & Act
    renderHeader();
    // Assert
    const homeLink = screen.getByRole('link', { name: /sınav salonu/i });
    expect(homeLink).toBeInTheDocument();
    expect(homeLink).toHaveAttribute('href', '/Home');
  });

  it('E-Sınıf (okul) giriş butonu mevcut', () => {
    // Arrange & Act — E-Sınıf refaktörü sonrası public nav: Giriş + E-Sınıf butonları
    renderHeader(null);
    // Assert
    expect(screen.getByRole('button', { name: /e-sınıf/i })).toBeInTheDocument();
  });

  it('E-Sınıf butonuna tıklanınca okul bağlamıyla giriş ekranına yönlenir', () => {
    // Arrange
    renderHeader(null);
    // Act
    fireEvent.click(screen.getByRole('button', { name: /e-sınıf/i }));
    // Assert — Login'e context=school query'siyle navigate
    expect(mockNavigate).toHaveBeenCalledWith(expect.stringContaining('context=school'));
  });

  it('dil seçici bileşeni render edilir', () => {
    // Arrange & Act
    renderHeader();
    // Assert
    expect(screen.getByTestId('lang-switcher')).toBeInTheDocument();
  });

  it('oturum açılmamışken Giriş yap butonu görünür', () => {
    // Arrange & Act
    renderHeader(null);
    // Assert
    expect(screen.getByRole('button', { name: /giriş/i })).toBeInTheDocument();
  });

  it('Giriş yap butonuna tıklanınca navigate çağrılır', () => {
    // Arrange
    renderHeader(null);

    // Act
    fireEvent.click(screen.getByRole('button', { name: /giriş/i }));

    // Assert
    expect(mockNavigate).toHaveBeenCalled();
  });
});
