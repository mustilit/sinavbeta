/**
 * TakeWrittenTest — sayfa testleri
 *
 * Kapsam:
 *   1. REVIEW modunda (SUBMITTED/TIMEOUT): Textarea ve canli QuestionCanvas yok,
 *      "Senin Cevabın" kutusu gorunur (metin + cizim <img>), cozum otomatik acik.
 *   2. SOLVING modunda (IN_PROGRESS): Textarea + QuestionCanvas gorunur,
 *      "Senin Cevabın" kutusu yok.
 *   3. Kalem butonu yalniz SOLVING'de gorunur, REVIEW'da yok.
 *   4. Teslim bandı yalniz SUBMITTED/TIMEOUT'da gorunur.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/* ------------------------------------------------------------------ */
/*  Mocks — sirayla: once vi.mock, sonra component import              */
/* ------------------------------------------------------------------ */

// i18n — key dondurur
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key, opts) => (opts && opts.defaultValue) || key,
    i18n: { language: 'tr', changeLanguage: vi.fn() },
  }),
  Trans: ({ children }) => children,
}));

// Auth
vi.mock('@/lib/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'u-1', email: 'aday@test.com', username: 'aday', full_name: 'Test Adayı' },
  }),
}));

// dalClient — candidateWritten namespace
const mockStart = vi.fn();
const mockGetState = vi.fn();
const mockSubmitAnswer = vi.fn();
const mockFinish = vi.fn();
const mockTimeout = vi.fn();
const mockGetSolution = vi.fn();
const mockUploadDrawing = vi.fn();
const mockReport = vi.fn();

vi.mock('@/api/dalClient', () => ({
  candidateWritten: {
    start: (...a) => mockStart(...a),
    getState: (...a) => mockGetState(...a),
    submitAnswer: (...a) => mockSubmitAnswer(...a),
    finish: (...a) => mockFinish(...a),
    timeout: (...a) => mockTimeout(...a),
    getSolution: (...a) => mockGetSolution(...a),
    uploadDrawing: (...a) => mockUploadDrawing(...a),
    reportQuestion: (...a) => mockReport(...a),
  },
}));

// Agir alt bilesenler — hafif stub
vi.mock('@/components/test/QuestionCanvas', () => ({
  default: vi.fn().mockImplementation(({ isActive }) =>
    isActive ? <div data-testid="question-canvas">Canvas Active</div> : <div data-testid="question-canvas">Canvas</div>
  ),
}));

vi.mock('@/components/test/TestWatermark', () => ({
  TestWatermark: () => <div data-testid="test-watermark" />,
}));

vi.mock('@/components/test/ReportQuestionModal', () => ({
  default: () => <div data-testid="report-modal" />,
}));

// sonner (toast)
vi.mock('sonner', () => ({
  toast: { error: vi.fn(), info: vi.fn(), success: vi.fn() },
}));

// lucide-react — kullanılan ikonları basit span olarak stub'la (X = Dialog kapat ikonu)
vi.mock('lucide-react', () => {
  const iconNames = [
    'Loader2', 'ArrowLeft', 'AlertTriangle', 'Pencil', 'Clock',
    'ChevronLeft', 'ChevronRight', 'Sun', 'CheckCircle2', 'BookOpen',
    'LogOut', 'Save', 'Eraser', 'X',
  ];
  const icons = {};
  for (const name of iconNames) {
    icons[name] = (props) => <span data-testid={`icon-${name}`} {...props} />;
  }
  return icons;
});

import TakeWrittenTest from './TakeWrittenTest';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function makeQuestions(overrides = []) {
  return [
    { id: 'q-1', content: 'Soru 1 icerigi', mediaUrl: null, order: 1, textAnswer: 'Cevabim', drawingUrl: 'https://uploads/draw1.png', ...overrides[0] },
    { id: 'q-2', content: 'Soru 2 icerigi', mediaUrl: null, order: 2, textAnswer: '', drawingUrl: null, ...overrides[1] },
  ];
}

function makeState(status, questionOverrides) {
  return {
    attempt: { id: 'att-1', status, testId: 'wt-1' },
    questions: makeQuestions(questionOverrides),
    timing: { remainingSeconds: status === 'IN_PROGRESS' ? 300 : null },
    test: { title: 'Yazili Test 1', isTimed: true },
  };
}

function renderPage(search = '?testId=wt-1') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[`/TakeWrittenTest${search}`]}>
        <TakeWrittenTest />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  // getSolution varsayilan
  mockGetSolution.mockResolvedValue({ solutionText: 'Cozum metni', solutionMediaUrl: null });
});

/* ------------------------------------------------------------------ */
/*  REVIEW mode (SUBMITTED)                                            */
/* ------------------------------------------------------------------ */
describe('REVIEW modu (attempt SUBMITTED)', () => {
  beforeEach(() => {
    mockStart.mockResolvedValue({ attemptId: 'att-1', resumed: true });
    mockGetState.mockResolvedValue(makeState('SUBMITTED'));
  });

  it('Textarea render edilmez', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('Soru 1 icerigi')).toBeInTheDocument());

    // Textarea olmamalı
    const textareas = document.querySelectorAll('textarea');
    expect(textareas.length).toBe(0);
  });

  it('canli QuestionCanvas render edilmez', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('Soru 1 icerigi')).toBeInTheDocument());

    // QuestionCanvas mock render edilmemeli (submitted check)
    expect(screen.queryByTestId('question-canvas')).not.toBeInTheDocument();
  });

  it('"Senin Cevabın" kutusu metin cevabi gosterir', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('Soru 1 icerigi')).toBeInTheDocument());

    // "Senin Cevabın" basligi
    expect(screen.getByText('pages:takeWritten.yourAnswer')).toBeInTheDocument();
    // Aday cevabi
    expect(screen.getByText('Cevabim')).toBeInTheDocument();
  });

  it('"Senin Cevabın" kutusu cizim resmini gosterir', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('Soru 1 icerigi')).toBeInTheDocument());

    // Cizim <img>
    const drawingImg = screen.getByAltText('pages:takeWritten.yourDrawing');
    expect(drawingImg).toBeInTheDocument();
    expect(drawingImg.getAttribute('src')).toBe('https://uploads/draw1.png');
  });

  it('cozum otomatik acilir (showSolution efekti)', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('Soru 1 icerigi')).toBeInTheDocument());

    // Cozum basligi gorunur olmalı (submitted → showSolution = true)
    expect(screen.getByText('pages:takeWritten.solutionTitle')).toBeInTheDocument();
  });

  it('kalem butonu gorunmez', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('Soru 1 icerigi')).toBeInTheDocument());

    // Pencil ikon-butonu submitted'da render edilmez
    const penButton = screen.queryByLabelText('pages:takeWritten.penToggle');
    expect(penButton).not.toBeInTheDocument();
  });

  it('teslim bandi gorunur', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('Soru 1 icerigi')).toBeInTheDocument());

    // submittedBanner
    expect(screen.getByText('pages:takeWritten.submittedBanner')).toBeInTheDocument();
  });
});

/* ------------------------------------------------------------------ */
/*  REVIEW mode (TIMEOUT)                                              */
/* ------------------------------------------------------------------ */
describe('REVIEW modu (attempt TIMEOUT)', () => {
  beforeEach(() => {
    mockStart.mockResolvedValue({ attemptId: 'att-1', resumed: true });
    mockGetState.mockResolvedValue(makeState('TIMEOUT'));
  });

  it('Textarea render edilmez (TIMEOUT da submitted sayilir)', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('Soru 1 icerigi')).toBeInTheDocument());
    expect(document.querySelectorAll('textarea').length).toBe(0);
  });

  it('teslim bandi gorunur', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('Soru 1 icerigi')).toBeInTheDocument());
    expect(screen.getByText('pages:takeWritten.submittedBanner')).toBeInTheDocument();
  });
});

/* ------------------------------------------------------------------ */
/*  SOLVING mode (IN_PROGRESS)                                         */
/* ------------------------------------------------------------------ */
describe('SOLVING modu (attempt IN_PROGRESS)', () => {
  beforeEach(() => {
    mockStart.mockResolvedValue({ attemptId: 'att-1', resumed: false });
    mockGetState.mockResolvedValue(makeState('IN_PROGRESS'));
  });

  it('Textarea render edilir', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('Soru 1 icerigi')).toBeInTheDocument());

    const textareas = document.querySelectorAll('textarea');
    expect(textareas.length).toBeGreaterThan(0);
  });

  it('QuestionCanvas render edilir', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('Soru 1 icerigi')).toBeInTheDocument());

    expect(screen.getByTestId('question-canvas')).toBeInTheDocument();
  });

  it('"Senin Cevabın" kutusu gorunmez', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('Soru 1 icerigi')).toBeInTheDocument());

    expect(screen.queryByText('pages:takeWritten.yourAnswer')).not.toBeInTheDocument();
  });

  it('kalem butonu gorunur', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('Soru 1 icerigi')).toBeInTheDocument());

    const penButton = screen.getByLabelText('pages:takeWritten.penToggle');
    expect(penButton).toBeInTheDocument();
  });

  it('teslim bandi gorunmez (submittedBanner)', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('Soru 1 icerigi')).toBeInTheDocument());

    expect(screen.queryByText('pages:takeWritten.submittedBanner')).not.toBeInTheDocument();
  });

  it('Teslim butonlari (Yaziliyi Bitir + Kaydet) gorunur', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('Soru 1 icerigi')).toBeInTheDocument());

    expect(screen.getByText('pages:takeWritten.submit')).toBeInTheDocument();
  });
});
