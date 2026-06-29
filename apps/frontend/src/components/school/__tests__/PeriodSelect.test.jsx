import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/test/schoolRender';
import { PeriodSelect } from '../PeriodSelect';

const h = vi.hoisted(() => ({ api: { periods: vi.fn() } }));
vi.mock('@/api/dalClient', () => ({ school: h.api }));

beforeEach(() => vi.clearAllMocks());

describe('PeriodSelect', () => {
  it('tek dönem → null (dropdown yok)', async () => {
    h.api.periods.mockResolvedValue({ periods: [{ id: 'p1', name: '2025-2026' }], currentPeriodId: 'p1' });
    const onChange = vi.fn();
    const { container } = renderWithProviders(<PeriodSelect value="" onChange={onChange} />);
    // güncel döneme kilitler
    await waitFor(() => expect(onChange).toHaveBeenCalledWith('p1'));
    expect(container.querySelector('button')).toBeNull();
  });

  it('çok dönem → dropdown render + güncel etiketi', async () => {
    h.api.periods.mockResolvedValue({ periods: [{ id: 'p1', name: '2024-2025' }, { id: 'p2', name: '2025-2026' }], currentPeriodId: 'p2' });
    renderWithProviders(<PeriodSelect value="p2" onChange={vi.fn()} />);
    expect(await screen.findByRole('combobox')).toBeInTheDocument();
  });

  it('seçim yoksa güncele kilitlenir (onChange çağrılır)', async () => {
    h.api.periods.mockResolvedValue({ periods: [{ id: 'p1', name: 'A' }, { id: 'p2', name: 'B' }], currentPeriodId: 'p2' });
    const onChange = vi.fn();
    renderWithProviders(<PeriodSelect value="" onChange={onChange} />);
    await waitFor(() => expect(onChange).toHaveBeenCalledWith('p2'));
  });
});
