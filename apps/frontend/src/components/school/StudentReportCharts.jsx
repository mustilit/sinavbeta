import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell, LineChart, Line,
} from "recharts";

const barColor = (v) => (v == null ? "#cbd5e1" : v >= 70 ? "#059669" : v >= 50 ? "#d97706" : "#e11d48");
const fmtDay = (d) => { const [, m, day] = String(d).split("-"); return `${day}.${m}`; };

function PctTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow text-xs">
      <p className="font-medium text-slate-800">{label}</p>
      <p className="text-slate-600">Ortalama: <span className="font-semibold">%{p.value ?? "—"}</span></p>
      {p.n != null && <p className="text-slate-400">{p.n} sınav</p>}
    </div>
  );
}

function Card({ title, children, empty }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-slate-700 mb-3">{title}</h3>
      {empty ? <p className="text-sm text-slate-400 py-10 text-center">Bu aralıkta veri yok.</p> : children}
    </div>
  );
}

function Bars({ title, data }) {
  const empty = data.length === 0 || data.every((d) => d.value == null);
  return (
    <Card title={title} empty={empty}>
      <ResponsiveContainer width="100%" height={Math.max(180, data.length * 34)}>
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
          <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11, fill: "#94a3b8" }} unit="%" />
          <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11, fill: "#475569" }} />
          <Tooltip content={<PctTooltip />} cursor={{ fill: "#f8fafc" }} />
          <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={22}>
            {data.map((d, i) => <Cell key={i} fill={barColor(d.value)} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
}

/** Öğrenci raporu grafikleri (recharts — lazy). */
export default function StudentReportCharts({ bySubject, byTopic, timeseries }) {
  const subj = (bySubject ?? []).map((d) => ({ name: d.name, value: d.avgPercent, n: d.count }));
  const top = (byTopic ?? []).map((d) => ({ name: d.name, value: d.avgPercent, n: d.count }));
  const ts = (timeseries ?? []).map((t) => ({ name: fmtDay(t.date), value: t.avgPercent, n: t.count }));

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <Bars title="Ders (zümre) başarımı (%)" data={subj} />
        <Bars title="Konu başarımı (%)" data={top} />
      </div>
      <Card title="Takvime göre başarım (%)" empty={ts.length === 0}>
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={ts} margin={{ left: 4, right: 16, top: 8, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#94a3b8" }} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "#94a3b8" }} unit="%" />
            <Tooltip content={<PctTooltip />} />
            <Line type="monotone" dataKey="value" stroke="#4f46e5" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
          </LineChart>
        </ResponsiveContainer>
      </Card>
    </div>
  );
}
