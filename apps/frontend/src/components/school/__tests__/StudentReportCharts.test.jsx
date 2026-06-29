import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { cloneElement } from 'react';

vi.mock('recharts', () => {
  const Pass = ({ children }) => <div>{children}</div>;
  return {
    ResponsiveContainer: Pass, BarChart: Pass, LineChart: Pass,
    XAxis: () => null, YAxis: () => null, CartesianGrid: () => null, Line: () => null, Cell: () => null,
    Bar: ({ children }) => <div>{children}</div>,
    Tooltip: ({ content }) => (
      <div>
        {cloneElement(content, { active: true, label: 'X', payload: [{ payload: { value: 70, pct: 70, q: 10, subs: 2 } }] })}
        {cloneElement(content, { active: false, payload: [] })}
      </div>
    ),
  };
});

import StudentReportCharts from '../StudentReportCharts';

const base = {
  bySubject: [{ name: 'Mat', avgPercent: 75, count: 2, questionCount: 12 }, { name: 'Fen', avgPercent: null, count: 1, questionCount: 4 }],
  byTopic: [{ name: 'Cebir', avgPercent: 60, count: 1, questionCount: 6 }],
  timeseries: [{ date: '2026-03-01', avgPercent: 70, count: 1, questionCount: 5 }],
};

describe('StudentReportCharts — çözülen soru / başarım toggle', () => {
  it('varsayılan: çözülen soru görünümü', () => {
    render(<StudentReportCharts {...base} />);
    expect(screen.getByText('Ders (zümre) — çözülen soru')).toBeInTheDocument();
    expect(screen.getByText('Konu — çözülen soru')).toBeInTheDocument();
    expect(screen.getByText('Takvime göre çözülen soru')).toBeInTheDocument();
    // tooltip count modunda "Çözülen soru" gösterir
    expect(screen.getAllByText(/Çözülen soru:/).length).toBeGreaterThan(0);
  });

  it('Başarım % sekmesine tıklayınca aynı format başarıma döner', () => {
    render(<StudentReportCharts {...base} />);
    fireEvent.click(screen.getByRole('button', { name: 'Başarım %' }));
    expect(screen.getByText('Ders (zümre) başarımı (%)')).toBeInTheDocument();
    expect(screen.getByText('Takvime göre başarım (%)')).toBeInTheDocument();
    expect(screen.getAllByText(/Ortalama:/).length).toBeGreaterThan(0);
  });

  it('grafiğe tıklayınca da metrik değişir (count → percent)', () => {
    render(<StudentReportCharts {...base} />);
    fireEvent.click(screen.getByText('Konu — çözülen soru'));
    expect(screen.getByText('Konu başarımı (%)')).toBeInTheDocument();
  });

  it('boş veri → "Bu aralıkta veri yok"', () => {
    render(<StudentReportCharts bySubject={[]} byTopic={[]} timeseries={[]} />);
    expect(screen.getAllByText('Bu aralıkta veri yok.').length).toBeGreaterThan(0);
  });

  it('undefined prop → çökme yok', () => {
    render(<StudentReportCharts />);
    expect(screen.getByText('Ders (zümre) — çözülen soru')).toBeInTheDocument();
  });
});
