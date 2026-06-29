import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/test/schoolRender';
import CredentialsDialog from '../CredentialsDialog';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(navigator, { clipboard: { writeText: vi.fn(async () => {}) } });
});

describe('CredentialsDialog', () => {
  it('creds yoksa null', () => {
    const { container } = renderWithProviders(<CredentialsDialog open creds={null} onClose={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('kullanıcı adı ile → "Kullanıcı adı" etiketi + kopyala', async () => {
    renderWithProviders(<CredentialsDialog open creds={{ username: 'ANK-S-1', tempPassword: 'p1' }} onClose={() => {}} />);
    expect(screen.getByText('Kullanıcı adı')).toBeInTheDocument();
    expect(screen.getByText('ANK-S-1')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Kopyala/ }));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expect.stringContaining('ANK-S-1')));
  });

  it('e-posta ile → "E-posta" etiketi', () => {
    renderWithProviders(<CredentialsDialog open creds={{ email: 'a@b.com', tempPassword: 'p1' }} onClose={() => {}} />);
    expect(screen.getByText('E-posta')).toBeInTheDocument();
    expect(screen.getByText('a@b.com')).toBeInTheDocument();
  });

  it('Tamam → onClose', () => {
    const onClose = vi.fn();
    renderWithProviders(<CredentialsDialog open creds={{ username: 'X', tempPassword: 'p' }} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Tamam' }));
    expect(onClose).toHaveBeenCalled();
  });
});
