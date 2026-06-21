/**
 * Sidebar bileşeni unit testleri
 * Kapsam: rol bazlı menü görünürlüğü, logout, collapsed modu
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { MemoryRouter } from 'react-router-dom';
import Sidebar from '../../layout/Sidebar';

vi.mock('@/lib/AuthContext', () => ({
  useAuth: () => ({ logout: mockLogout }),
}));

vi.mock('@/utils', () => ({
  createPageUrl: (name) => `/${name}`,
}));

vi.mock('@/lib/utils', () => ({
  cn: (...args) => args.filter(Boolean).join(' '),
}));

const mockLogout = vi.fn();

function renderSidebar(user = null, collapsed = false) {
  return render(
    <MemoryRouter>
      <Sidebar user={user} currentPage="Home" collapsed={collapsed} />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Sidebar bileşeni', () => {
  it('kullanıcı null iken aday linkleri gösterilir', () => {
    // Arrange & Act
    renderSidebar(null);
    // Assert — aday linkleri default gösterilmeli
    expect(screen.getByRole('link', { name: /keşfet/i })).toBeInTheDocument();
  });

  it('CANDIDATE rolü ile aday menüsü render edilir', () => {
    // Arrange & Act
    renderSidebar({ role: 'CANDIDATE' });
    // Assert — "Keşfet" ve "Satın Alınan Sınavlar" linkleri
    expect(screen.getByRole('link', { name: /keşfet/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /satın alınan sınavlar/i })).toBeInTheDocument();
  });

  it('EDUCATOR rolü ile aktif eğitici menüsü render edilir', () => {
    // Arrange & Act
    renderSidebar({
      role: 'EDUCATOR',
      status: 'ACTIVE',
      educatorApprovedAt: new Date().toISOString(),
    });
    // Assert — eğitici linkleri
    expect(screen.getByRole('link', { name: /test oluştur/i })).toBeInTheDocument();
  });

  it('onaylanmamış EDUCATOR\'de sınırlı menü gösterilir', () => {
    // Arrange & Act
    renderSidebar({ role: 'EDUCATOR', status: 'PENDING', educatorApprovedAt: null });
    // Assert — sadece ayarlar linki olmalı
    expect(screen.queryByRole('link', { name: /test oluştur/i })).not.toBeInTheDocument();
  });

  it('ADMIN rolü ile admin linkleri render edilir', () => {
    // Arrange & Act
    renderSidebar({ role: 'ADMIN' });
    // Assert
    expect(screen.getByRole('link', { name: /yönetim paneli/i })).toBeInTheDocument();
  });

  it('ADMIN rolü ile hem admin hem aday linkleri gösterilir', () => {
    // Arrange & Act
    renderSidebar({ role: 'ADMIN' });
    // Assert — admin ve candidate linkleri
    expect(screen.getByRole('link', { name: /keşfet/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /yönetim paneli/i })).toBeInTheDocument();
  });

  it('çıkış yap butonu mevcut ve tıklanınca logout çağrılır', () => {
    // Arrange
    renderSidebar({ role: 'CANDIDATE' });

    // Act
    const logoutBtn = screen.getByRole('button', { name: /çıkış yap/i });
    fireEvent.click(logoutBtn);

    // Assert
    expect(mockLogout).toHaveBeenCalledWith(true);
  });

  it('WORKER rolü ile workerPages\'e göre filtreli linkler gösterilir', () => {
    // Arrange & Act
    renderSidebar({
      role: 'WORKER',
      workerPages: ['AdminDashboard', 'ManageUsers'],
    });
    // Assert — sadece workerPages'deki linkler mevcut
    expect(screen.getByRole('link', { name: /yönetim paneli/i })).toBeInTheDocument();
    // Eğitici raporu yok (workerPages'de değil)
    expect(screen.queryByRole('link', { name: /eğitici raporu/i })).not.toBeInTheDocument();
  });
});
