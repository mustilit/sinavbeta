import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { cloneElement } from 'react';

vi.mock('recharts', () => {
  const Pass = ({ children }) => <div>{children}</div>;
  return {
    ResponsiveContainer: Pass, BarChart: Pass, LineChart: Pass,
    XAxis: () => null, YAxis: () => null, CartesianGrid: () => null, Line: () => null, Cell: () => null,
    Bar: ({ children }) => <div>{children}</div>,
    Tooltip: ({ content }) => (
      <div>
        {cloneElement(content, { active: true, label: 'X', payload: [{ payload: { value: 70, n: 3 } }] })}
        {cloneElement(content, { active: true, label: 'Y', payload: [{ payload: { value: null, n: null } }] })}
        {cloneElement(content, { active: false, payload: [] })}
      </div>
    ),
  };
});

import StudentReportCharts from '../StudentReportCharts';

const base = {
  bySubject: [{ name: 'Mat', avgPercent: 75, count: 4 }, { name: 'Fen', avgPercent: 40, count: 2 }],
  byTopic: [{ name: 'Cebir', avgPercent: 60, count: 3 }],
  timeseries: [{ date: '2026-03-01', avgPercent: 70, count: 3 }],
};

describe('StudentReportCharts', () => {
  it('üç grafik başlığı', () => {
    render(<StudentReportCharts {...base} />);
    expect(screen.getByText('Ders (zümre) başarımı (%)')).toBeInTheDocument();
    expect(screen.getByText('Konu başarımı (%)')).toBeInTheDocument();
    expect(screen.getByText('Takvime göre başarım (%)')).toBeInTheDocument();
  });

  it('boş veri → "Bu aralıkta veri yok"', () => {
    render(<StudentReportCharts bySubject={[]} byTopic={[]} timeseries={[]} />);
    expect(screen.getAllByText('Bu aralıkta veri yok.').length).toBeGreaterThan(0);
  });

  it('undefined prop → çökme yok', () => {
    render(<StudentReportCharts />);
    expect(screen.getByText('Ders (zümre) başarımı (%)')).toBeInTheDocument();
  });
});
