import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { cloneElement } from 'react';

// recharts'ı jsdom'da çalışır kıl: Tooltip içeriğini örnek payload ile klonla,
// Bar/Cell render fonksiyonlarını koştur (PctTooltip + barColor kapsanır).
vi.mock('recharts', () => {
  const Pass = ({ children }) => <div>{children}</div>;
  return {
    ResponsiveContainer: Pass, BarChart: Pass, LineChart: Pass,
    XAxis: () => null, YAxis: () => null, CartesianGrid: () => null, Line: () => null,
    Cell: () => null,
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

import ReportCharts from '../ReportCharts';

const base = {
  branches: [{ name: 'Merkez', avgPercent: 75, submissionCount: 10 }, { name: 'Şube2', avgPercent: 40, submissionCount: 5 }, { name: 'Boş', avgPercent: null, submissionCount: 0 }],
  levels: [{ gradeLevel: 5, avgPercent: 60, submissionCount: 8 }],
  classrooms: [{ name: '5-A', avgPercent: 55, submissionCount: 6 }],
  byDepartment: [{ name: 'Mat', avgPercent: 80, submissionCount: 4 }],
  timeseries: [{ date: '2026-03-01', avgPercent: 70, submissionCount: 3 }],
};

describe('ReportCharts', () => {
  it('branches sekmesi başlıkları', () => {
    render(<ReportCharts tab="branches" {...base} />);
    expect(screen.getByText('Şube başarımı (%)')).toBeInTheDocument();
    expect(screen.getByText('Konu (zümre) başarımı (%)')).toBeInTheDocument();
    expect(screen.getByText('Takvime göre başarım (%)')).toBeInTheDocument();
  });

  it('levels sekmesi başlığı', () => {
    render(<ReportCharts tab="levels" {...base} />);
    expect(screen.getByText('Seviye başarımı (%)')).toBeInTheDocument();
  });

  it('classrooms sekmesi başlığı', () => {
    render(<ReportCharts tab="classrooms" {...base} />);
    expect(screen.getByText('Sınıf başarımı (%)')).toBeInTheDocument();
  });

  it('boş veri → "Bu aralıkta veri yok"', () => {
    render(<ReportCharts tab="branches" branches={[]} levels={[]} classrooms={[]} byDepartment={[]} timeseries={[]} />);
    expect(screen.getAllByText('Bu aralıkta veri yok.').length).toBeGreaterThan(0);
  });

  it('undefined byDepartment/timeseries → çökme yok', () => {
    render(<ReportCharts tab="branches" branches={base.branches} levels={[]} classrooms={[]} byDepartment={undefined} timeseries={undefined} />);
    expect(screen.getByText('Şube başarımı (%)')).toBeInTheDocument();
  });
});
