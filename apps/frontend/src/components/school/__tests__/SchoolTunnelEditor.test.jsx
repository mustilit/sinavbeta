import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { SchoolTunnelEditor, toLocalTunnelQuestions, emptyTunnelQ, uploadPendingTunnelImages } from '../SchoolTunnelEditor';

const h = vi.hoisted(() => ({ upload: vi.fn(), parseDocx: vi.fn(), parsePdf: vi.fn() }));
vi.mock('@/components/live/LiveQuestionsEditor', () => ({ doUpload: h.upload }));
vi.mock('@/lib/importQuestions', () => ({ parseDocxToQuestions: h.parseDocx, parsePdfToQuestions: h.parsePdf }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function Harness({ initial = [], layerCount = 3, optionCount = 4 }) {
  const [qs, setQs] = useState(initial);
  return <SchoolTunnelEditor questions={qs} setQuestions={setQs} layerCount={layerCount} optionCount={optionCount} />;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.upload.mockResolvedValue('http://img/up.webp');
});

describe('SchoolTunnelEditor — saf yardımcılar', () => {
  it('emptyTunnelQ: ilk şık doğru, en az 2 şık', () => {
    const q = emptyTunnelQ(4, 2);
    expect(q.options).toHaveLength(4);
    expect(q.options[0].isCorrect).toBe(true);
    expect(q.layerIndex).toBe(2);
  });
  it('toLocalTunnelQuestions: optionCount kadar doldurur + layerIndex', () => {
    const out = toLocalTunnelQuestions([{ content: 'S', layerIndex: 3, options: [{ content: 'A', isCorrect: true }] }], 5);
    expect(out[0].options).toHaveLength(5);
    expect(out[0].layerIndex).toBe(3);
  });
  it('uploadPendingTunnelImages: _imgFile → doUpload', async () => {
    const out = await uploadPendingTunnelImages([{ _k: '1', content: 'S', _imgFile: {}, points: 2, layerIndex: 1, options: [{ content: 'A', isCorrect: true, _imgFile: {} }, { content: 'B' }] }]);
    expect(h.upload).toHaveBeenCalledTimes(2);
    expect(out[0].mediaUrl).toBe('http://img/up.webp');
    expect(out[0].options[0].mediaUrl).toBe('http://img/up.webp');
  });
});

describe('SchoolTunnelEditor — UI', () => {
  it('katman navigasyonu render + boş katman', () => {
    render(<Harness />);
    expect(screen.getByRole('button', { name: /Katman 1/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Katman 3/ })).toBeInTheDocument();
    expect(screen.getByText(/Bu katmanda henüz soru yok/)).toBeInTheDocument();
  });

  it('Soru Ekle → açık editör → metin + şık doldur', async () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: /Soru Ekle/ }));
    const ta = await screen.findByPlaceholderText(/Soru metni/);
    fireEvent.change(ta, { target: { value: 'Tünel sorusu' } });
    fireEvent.change(screen.getByPlaceholderText('A şıkkı'), { target: { value: 'doğru' } });
    fireEvent.change(screen.getByPlaceholderText('B şıkkı'), { target: { value: 'yanlış' } });
    expect(screen.getByDisplayValue('Tünel sorusu')).toBeInTheDocument();
  });

  it('katman değiştir → soru sayısı rozetine yansır', async () => {
    render(<Harness initial={[{ ...emptyTunnelQ(4, 2), content: 'L2 soru' }]} />);
    // Katman 2 rozetinde 1 görünür
    const layer2 = screen.getByRole('button', { name: /Katman 2/ });
    expect(within(layer2).getByText('1')).toBeInTheDocument();
    fireEvent.click(layer2);
    expect(await screen.findByText(/L2 soru|1 Seçenekli|Soru 1/)).toBeInTheDocument();
  });

  it('Sil → soru kaldırılır', async () => {
    render(<Harness initial={[{ ...emptyTunnelQ(4, 1), content: 'Silinecek' }]} />);
    expect(screen.getByText('Soru 1')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Sil' }));
    expect(screen.getByText(/Bu katmanda henüz soru yok/)).toBeInTheDocument();
  });

  it('doğru şık radio değiştir', async () => {
    render(<Harness initial={[{ ...emptyTunnelQ(4, 1), content: 'S', options: [{ content: 'A', isCorrect: true }, { content: 'B' }, { content: 'C' }, { content: 'D' }] }]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Düzenle' }));
    const radioB = await screen.findByLabelText('B doğru');
    fireEvent.click(radioB);
    expect(radioB).toBeChecked();
  });

  it('DOCX içe aktar → sorular eklenir', async () => {
    h.parseDocx.mockResolvedValue([{ ...emptyTunnelQ(4, 1), content: 'D1' }]);
    render(<Harness />);
    const input = document.querySelector('input[accept=".docx"]');
    fireEvent.change(input, { target: { files: [new File(['x'], 't.docx')] } });
    await waitFor(() => expect(h.parseDocx).toHaveBeenCalled());
    expect(await screen.findByText('Soru 1')).toBeInTheDocument();
  });
});
