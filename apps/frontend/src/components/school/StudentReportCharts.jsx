import { useState } from "react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell, LineChart, Line,
} from "recharts";

const barColor = (v) => (v == null ? "#cbd5e1" : v >= 70 ? "#059669" : v >= 50 ? "#d97706" : "#e11d48");
const fmtDay = (d) => { const [, m, day] = String(d).split("-"); return `${day}.${m}`; };

// mode: 'count' (çözülen soru) | 'percent' (başarım %)
function MetricTooltip({ active = false, payload = null, label = "", mode }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow text-xs">
      <p className="font-medium text-slate-800">{label}</p>
      {mode === "count" ? (
        <p className="text-slate-600">Çözülen soru: <span className="font-semibold">{p.q ?? 0}</span></p>
      ) : (
        <p className="text-slate-600">Ortalama: <span className="font-semibold">%{p.pct ?? "—"}</span></p>
      )}
      {p.subs != null && <p className="text-slate-400">{p.subs} sınav</p>}
    </div>
  );
}

function Card({ title, children, empty, onToggle }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 cursor-pointer hover:border-indigo-200 transition-colors" onClick={onToggle} title="Çözülen soru / başarım arasında geçiş için tıkla">
      <h3 className="text-sm font-semibold text-slate-700 mb-3">{title}</h3>
      {empty ? <p className="text-sm text-slate-400 py-10 text-center">Bu aralıkta veri yok.</p> : children}
    </div>
  );
}

function Bars({ title, data, mode, onToggle }) {
  const isCount = mode === "count";
  const empty = data.length === 0 || data.every((d) => (isCount ? !d.value : d.value == null));
  return (
    <Card title={title} empty={empty} onToggle={onToggle}>
      <ResponsiveContainer width="100%" height={Math.max(180, data.length * 34)}>
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
          <XAxis type="number" domain={isCount ? [0, "auto"] : [0, 100]} allowDecimals={false} tick={{ fontSize: 11, fill: "#94a3b8" }} unit={isCount ? "" : "%"} />
          <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11, fill: "#475569" }} />
          <Tooltip content={<MetricTooltip mode={mode} />} cursor={{ fill: "#f8fafc" }} />
          <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={22}>
            {data.map((d, i) => <Cell key={i} fill={isCount ? "#6366f1" : barColor(d.pct)} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
}

/**
 * Öğrenci raporu grafikleri (recharts — lazy).
 * Varsayılan görünüm: çözülen SORU SAYISI (puanlama olmadan da anlamlı). Bir grafiğe
 * (ya da üstteki anahtara) tıklayınca aynı formatta BAŞARIM (%) görünümüne geçer.
 */
export default function StudentReportCharts({ bySubject, byTopic, timeseries }) {
  const [mode, setMode] = useState("count"); // önce çözülen soru, tıklayınca başarım
  const isCount = mode === "count";
  const toggle = () => setMode((m) => (m === "count" ? "percent" : "count"));

  // value = aktif metrik (mode'a göre); pct/q/subs tooltip + renk için taşınır
  const map = (arr) => (arr ?? []).map((d) => ({ name: d.name, value: isCount ? (d.questionCount ?? 0) : d.avgPercent, pct: d.avgPercent, q: d.questionCount ?? 0, subs: d.count ?? 0 }));
  const subj = map(bySubject);
  const top = map(byTopic);
  const ts = (timeseries ?? []).map((t) => ({ name: fmtDay(t.date), value: isCount ? (t.questionCount ?? 0) : t.avgPercent, pct: t.avgPercent, q: t.questionCount ?? 0, subs: t.count ?? 0 }));
  const tsEmpty = ts.length === 0 || ts.every((d) => (isCount ? !d.value : d.value == null));

  const unitTitle = (base) => (isCount ? `${base} — çözülen soru` : `${base} başarımı (%)`);
  const tab = (m, label) => (
    <button type="button" onClick={() => setMode(m)}
      className={`px-3 py-1.5 rounded-md text-xs font-medium ${mode === m ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
      {label}
    </button>
  );

  return (
    <div className="space-y-4">
      {/* Metrik anahtarı — önce çözülen soru, tıklayınca başarım */}
      <div className="flex items-center justify-end">
        <div className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-0.5">
          {tab("count", "Çözülen soru")}
          {tab("percent", "Başarım %")}
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Bars title={unitTitle("Ders (zümre)")} data={subj} mode={mode} onToggle={toggle} />
        <Bars title={unitTitle("Konu")} data={top} mode={mode} onToggle={toggle} />
      </div>
      <Card title={isCount ? "Takvime göre çözülen soru" : "Takvime göre başarım (%)"} empty={tsEmpty} onToggle={toggle}>
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={ts} margin={{ left: 4, right: 16, top: 8, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#94a3b8" }} />
            <YAxis domain={isCount ? [0, "auto"] : [0, 100]} allowDecimals={false} tick={{ fontSize: 11, fill: "#94a3b8" }} unit={isCount ? "" : "%"} />
            <Tooltip content={<MetricTooltip mode={mode} />} />
            <Line type="monotone" dataKey="value" stroke="#4f46e5" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
          </LineChart>
        </ResponsiveContainer>
      </Card>
    </div>
  );
}
