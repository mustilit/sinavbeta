import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { SchoolExamQuestionsEditor, toLocalQuestions, emptyChoiceQ, emptyWrittenQ } from '../SchoolExamQuestionsEditor';

const h = vi.hoisted(() => ({ upload: vi.fn(), parseDocx: vi.fn(), parsePdf: vi.fn() }));
vi.mock('@/components/live/LiveQuestionsEditor', () => ({ doUpload: h.upload }));
vi.mock('@/lib/importQuestions', () => ({ parseDocxToQuestions: h.parseDocx, parsePdfToQuestions: h.parsePdf }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function Harness({ choice = true, initial = [] }) {
  const [qs, setQs] = useState(initial);
  return <SchoolExamQuestionsEditor questions={qs} setQuestions={setQs} choice={choice} />;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.upload.mockResolvedValue('http://img/x.webp');
});

describe('SchoolExamQuestionsEditor — saf yardımcılar', () => {
  it('toLocalQuestions: choice → 5 sabit şık doldurur', () => {
    const out = toLocalQuestions([{ content: 'S', options: [{ content: 'A', isCorrect: true }] }], true);
    expect(out[0].options).toHaveLength(5);
    expect(out[0].options[0]).toMatchObject({ content: 'A', isCorrect: true });
  });
  it('toLocalQuestions: written → şıksız', () => {
    const out = toLocalQuestions([{ content: 'S', solutionText: 'çöz' }], false);
    expect(out[0].options).toBeUndefined();
    expect(out[0].solutionText).toBe('çöz');
  });
  it('emptyChoiceQ/emptyWrittenQ', () => {
    expect(emptyChoiceQ().options).toHaveLength(5);
    expect(emptyWrittenQ().options).toBeUndefined();
  });
});

describe('SchoolExamQuestionsEditor — choice (TEST)', () => {
  it('boş → "Henüz soru yok"', () => {
    render(<Harness />);
    expect(screen.getByText(/Henüz soru yok/)).toBeInTheDocument();
  });

  it('Soru Ekle → dialog otomatik açılır → doldur → Tamamla → satır oluşur', async () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: /Soru Ekle/ }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Soru 1 Ekle')).toBeInTheDocument();
    fireEvent.change(within(dialog).getByPlaceholderText('Soru metnini giriniz...'), { target: { value: '2+2 kaçtır?' } });
    fireEvent.change(within(dialog).getByPlaceholderText('Seçenek A'), { target: { value: '4' } });
    fireEvent.change(within(dialog).getByPlaceholderText('Seçenek B'), { target: { value: '5' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Tamamla' }));
    await waitFor(() => expect(screen.getByText(/Doğru: A/)).toBeInTheDocument());
    expect(screen.getByText(/1 soru/)).toBeInTheDocument();
  });

  it('eksik içerikle Tamamla → kaydetmez (validate)', async () => {
    const { toast } = await import('sonner');
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: /Soru Ekle/ }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Tamamla' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(screen.getByRole('dialog')).toBeInTheDocument(); // hâlâ açık
  });

  it('Sil → soru kaldırılır', async () => {
    render(<Harness initial={[{ ...emptyChoiceQ(), content: 'S', options: [{ content: 'A', isCorrect: true }, { content: 'B' }, {}, {}, {}] }]} />);
    expect(screen.getByText('Soru 1')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Sil' }));
    expect(screen.getByText(/Henüz soru yok/)).toBeInTheDocument();
  });

  it('Önizleme sekmesi → kart gösterir', async () => {
    render(<Harness initial={[{ ...emptyChoiceQ(), content: 'Soru içeriği', options: [{ content: 'A', isCorrect: true }, { content: 'B' }, {}, {}, {}] }]} />);
    fireEvent.click(screen.getByRole('button', { name: /Önizleme/ }));
    expect(screen.getByText('Soru içeriği')).toBeInTheDocument();
  });

  it('DOCX içe aktar → setQuestions', async () => {
    h.parseDocx.mockResolvedValue([{ ...emptyChoiceQ(), content: 'İçe1' }, { ...emptyChoiceQ(), content: 'İçe2' }]);
    render(<Harness />);
    const input = document.querySelector('input[accept=".docx"]');
    fireEvent.change(input, { target: { files: [new File(['x'], 'q.docx')] } });
    await waitFor(() => expect(h.parseDocx).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText(/2 soru/)).toBeInTheDocument());
  });

  it('DOCX boş → hata toast', async () => {
    const { toast } = await import('sonner');
    h.parseDocx.mockResolvedValue([]);
    render(<Harness />);
    const input = document.querySelector('input[accept=".docx"]');
    fireEvent.change(input, { target: { files: [new File(['x'], 'q.docx')] } });
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('İçe aktarılacak soru bulunamadı'));
  });
});

describe('SchoolExamQuestionsEditor — written', () => {
  it('written: çözüm zorunlu → doldur → "Çözümlü"', async () => {
    render(<Harness choice={false} />);
    fireEvent.click(screen.getByRole('button', { name: /Soru Ekle/ }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByPlaceholderText('Soru metnini giriniz...'), { target: { value: 'Yorum sorusu' } });
    fireEvent.change(within(dialog).getByPlaceholderText('Çözüm metnini yazın...'), { target: { value: 'Referans cevap' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Tamamla' }));
    await waitFor(() => expect(screen.getByText('Çözümlü')).toBeInTheDocument());
  });
});
