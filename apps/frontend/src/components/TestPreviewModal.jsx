/**
 * TestPreviewModal
 * Eğiticinin testi adayın gözünden görmesini sağlar.
 * Sorular soru soru gösterilir; şıklar tıklanabilir ama gönderilmez.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  X,
  ChevronLeft,
  ChevronRight,
  Eye,
  CheckCircle2,
  LayoutGrid,
} from "lucide-react";
import { cn } from "@/lib/utils";
import ZoomableImage from "@/components/ZoomableImage";

const LETTERS = ["A", "B", "C", "D", "E"];

// ─── Şık kartı ────────────────────────────────────────────────────────────────
function OptionCard({ option, letter, selected, onClick }) {
  return (
    <button
      type="button"
      onClick={() => onClick(option.id)}
      className={cn(
        "w-full flex items-start gap-4 p-4 rounded-xl border-2 text-left transition-all duration-150",
        selected
          ? "border-indigo-500 bg-indigo-50"
          : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
      )}
    >
      <span
        className={cn(
          "w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold shrink-0 mt-0.5 transition-colors",
          selected ? "bg-indigo-600 text-white" : "bg-slate-200 text-slate-700"
        )}
      >
        {letter}
      </span>
      <div className="flex-1 min-w-0 flex items-center gap-3 flex-wrap">
        {option.mediaUrl && (
          <ZoomableImage
            src={option.mediaUrl}
            alt={`${letter} şıkkı`}
            className="max-h-32 rounded-lg object-contain border border-slate-200 bg-white"
          />
        )}
        {option.content && (
          <span
            className={cn(
              "text-base leading-relaxed",
              selected ? "text-indigo-800 font-medium" : "text-slate-800"
            )}
          >
            {option.content}
          </span>
        )}
      </div>
      {selected && (
        <CheckCircle2 className="w-5 h-5 text-indigo-500 shrink-0 mt-0.5" />
      )}
    </button>
  );
}

// ─── Soru grid butonu ─────────────────────────────────────────────────────────
function GridButton({ num, current, answered, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-8 h-8 rounded-lg text-xs font-semibold transition-colors",
        current
          ? "bg-indigo-600 text-white ring-2 ring-indigo-600 ring-offset-2"
          : answered
          ? "bg-indigo-100 text-indigo-700 hover:bg-indigo-200"
          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
      )}
    >
      {num}
    </button>
  );
}

// ─── Ana bileşen ──────────────────────────────────────────────────────────────
export function TestPreviewModal({
  questions = [],
  title = "",
  isOpen,
  onClose,
  onConfirm = null,
}) {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState(/** @type {any} */ ({}));
  const [showGrid, setShowGrid] = useState(false);

  if (!isOpen) return null;

  const q = questions[currentIdx];
  if (!q) return null;

  const total = questions.length;
  const isFirst = currentIdx === 0;
  const isLast = currentIdx === total - 1;
  const answeredCount = Object.keys(selectedAnswers).filter(
    (k) => selectedAnswers[k]
  ).length;
  const progressPct = ((currentIdx + 1) / total) * 100;

  const handleSelect = (optionId) => {
    setSelectedAnswers((prev) => ({
      ...prev,
      [q.id]: prev[q.id] === optionId ? undefined : optionId,
    }));
  };

  const goTo = (idx) => {
    setCurrentIdx(idx);
    setShowGrid(false);
  };

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-slate-50">
      {/* ── Üst çubuk ── */}
      <div className="bg-white border-b border-slate-200 shadow-sm shrink-0">
        <div className="max-w-4xl mx-auto flex items-center justify-between px-5 py-3">
          <div className="flex items-center gap-3">
            <Badge className="bg-amber-100 text-amber-700 border-amber-200 gap-1.5">
              <Eye className="w-3.5 h-3.5" /> Aday Önizlemesi
            </Badge>
            <span className="font-semibold text-slate-800 truncate max-w-xs">
              {title}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">
              {answeredCount}/{total} seçildi (gönderilmez)
            </span>
            {onConfirm && (
              <Button
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700 gap-1.5"
                onClick={onConfirm}
              >
                <CheckCircle2 className="w-4 h-4" /> Yayınla
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={onClose}
              className="text-slate-500 hover:text-slate-800"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* İlerleme çubuğu */}
        <div className="h-1 bg-slate-100">
          <div
            className="h-full bg-indigo-500 transition-all duration-300"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* ── Gövde ── */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-5 py-8">
          {/* Soru numarası + grid toggle */}
          <div className="flex items-center justify-between mb-6">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-widest">
              Soru {currentIdx + 1} / {total}
            </span>
            <button
              type="button"
              onClick={() => setShowGrid((v) => !v)}
              className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-indigo-600 transition-colors"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              Tüm Sorular
            </button>
          </div>

          {/* Mini soru grid */}
          {showGrid && (
            <div className="bg-white border border-slate-200 rounded-2xl p-4 mb-6 shadow-sm">
              <p className="text-xs font-medium text-slate-500 mb-3">
                Soruya atla
              </p>
              <div className="flex flex-wrap gap-2">
                {questions.map((_, i) => (
                  <GridButton
                    key={i}
                    num={i + 1}
                    current={i === currentIdx}
                    answered={!!selectedAnswers[questions[i].id]}
                    onClick={() => goTo(i)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Soru kartı */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mb-6">
            {q.mediaUrl && (
              <div className="flex justify-center mb-5">
                <ZoomableImage
                  src={q.mediaUrl}
                  alt="soru görseli"
                  className="max-h-64 rounded-xl border border-slate-100 object-contain"
                  size="lg"
                />
              </div>
            )}

            {q.content && (
              q.content.trim().startsWith("<") ? (
                <div
                  className="text-lg font-medium text-slate-900 leading-relaxed mb-6 prose prose-slate max-w-none"
                  dangerouslySetInnerHTML={{ __html: q.content }}
                />
              ) : (
                <p className="text-lg font-medium text-slate-900 leading-relaxed mb-6">
                  {q.content}
                </p>
              )
            )}

            <div className="space-y-3">
              {/* Sadece dolu seçenekler render edilir.
                  EditTest'teki apiQToLocal editör UI için diziyi 5'e padding yapar
                  (boş slot kutuları); aday önizlemesinde bu boş kutular gözükmemeli.
                  Letter (A/B/C/D/E) görünür sıraya göre yeniden atanır — boş bir
                  D varsa filtrelenir ve E "D" olarak gösterilir. */}
              {(q.options || [])
                .filter((opt) => (opt.content && opt.content.trim()) || opt.mediaUrl)
                .map((opt, idx) => (
                  <OptionCard
                    key={opt.id}
                    option={opt}
                    letter={LETTERS[idx]}
                    selected={selectedAnswers[q.id] === opt.id}
                    onClick={handleSelect}
                  />
                ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Alt navigasyon ── */}
      <div className="bg-white border-t border-slate-200 shadow-[0_-1px_4px_rgba(0,0,0,0.06)] shrink-0">
        <div className="max-w-3xl mx-auto flex items-center justify-between px-5 py-3 gap-3">
          <Button
            variant="outline"
            className="gap-1.5 border-slate-300"
            disabled={isFirst}
            onClick={() => setCurrentIdx((i) => i - 1)}
          >
            <ChevronLeft className="w-4 h-4" /> Önceki
          </Button>

          {/* Orta: sayfa numaraları */}
          <div className="hidden sm:flex items-center gap-1 flex-wrap justify-center">
            {questions.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => goTo(i)}
                className={cn(
                  "w-7 h-7 rounded-md text-xs font-medium transition-colors",
                  i === currentIdx
                    ? "bg-indigo-600 text-white"
                    : selectedAnswers[questions[i].id]
                    ? "bg-indigo-100 text-indigo-700"
                    : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                )}
              >
                {i + 1}
              </button>
            ))}
          </div>
          <span className="sm:hidden text-sm text-slate-500">
            {currentIdx + 1} / {total}
          </span>

          {isLast ? (
            onConfirm ? (
              <Button
                className="bg-emerald-600 hover:bg-emerald-700 gap-1.5"
                onClick={onConfirm}
              >
                <CheckCircle2 className="w-4 h-4" /> Yayınla
              </Button>
            ) : (
              <Button
                variant="outline"
                onClick={onClose}
                className="border-slate-300 gap-1.5"
              >
                <X className="w-4 h-4" /> Kapat
              </Button>
            )
          ) : (
            <Button
              className="bg-indigo-600 hover:bg-indigo-700 gap-1.5"
              onClick={() => setCurrentIdx((i) => i + 1)}
            >
              Sonraki <ChevronRight className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
