import { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { StickyNote, X, Send, Loader2, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/lib/AuthContext";
import { notes as notesApi } from "@/api/dalClient";

/**
 * Sağ-altta sabit duran "+ Not" widget'ı. Soru çözme ekranında render edilir.
 * Açılınca chat benzeri bir panel: üstte ilgili notların akışı, altta yazma alanı.
 * "Bu soru" (adresli) / "Genel" (serbest) kapsamı seçilebilir.
 *
 * @param {{ testId?:string, questionId?:string, attemptId?:string, questionOrder?:number, testTitle?:string }} props
 */
export function NoteWidget({ testId, questionId, attemptId, questionOrder, testTitle }) {
  const { t } = useTranslation("pages");
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  // Soru varsa varsayılan "bu soru"; yoksa "genel".
  const [scope, setScope] = useState(questionId ? "question" : "general");
  const [text, setText] = useState("");
  const threadEndRef = useRef(null);

  // Soru değişince kapsamı uygun şekilde sıfırla
  useEffect(() => {
    setScope(questionId ? "question" : "general");
  }, [questionId]);

  const isCandidate = user?.role === "CANDIDATE";

  // İlgili notların akışı: kapsam "bu soru/test" ise testId ile, "genel" ise scope=general.
  const threadParams =
    scope === "question" && testId
      ? { testId, limit: 30 }
      : { scope: "general", limit: 30 };

  const { data: thread, isLoading: threadLoading } = useQuery({
    queryKey: ["noteThread", threadParams],
    queryFn: () => notesApi.list(threadParams),
    enabled: open && isCandidate,
    staleTime: 10_000,
  });

  const createNote = useMutation({
    mutationFn: (body) =>
      notesApi.create(
        scope === "question"
          ? { body, questionId, testId, attemptId, questionOrder }
          : { body },
      ),
    onSuccess: () => {
      setText("");
      toast.success(t("notes.widget.saved"));
      queryClient.invalidateQueries({ queryKey: ["noteThread"] });
      queryClient.invalidateQueries({ queryKey: ["myNotes"] });
      queryClient.invalidateQueries({ queryKey: ["noteFacets"] });
    },
    onError: () => toast.error(t("notes.widget.error")),
  });

  // Akış güncellenince en alta kaydır (chat hissi)
  useEffect(() => {
    if (open && threadEndRef.current) {
      threadEndRef.current.scrollIntoView({ block: "end" });
    }
  }, [thread, open]);

  if (!isCandidate) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    const body = text.trim();
    if (!body || createNote.isPending) return;
    createNote.mutate(body);
  };

  // Akış: API en yeni → en eski döndürür; chat için ters çevirip en yeniyi alta koy.
  const items = thread?.items ? [...thread.items].reverse() : [];

  return (
    <div className="fixed bottom-4 right-4 z-50 print:hidden">
      {open ? (
        <div
          className="flex w-[min(92vw,22rem)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
          role="dialog"
          aria-label={t("notes.widget.title")}
        >
          {/* Başlık */}
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 bg-slate-50 px-4 py-2.5 dark:border-slate-800 dark:bg-slate-800/60">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
              <StickyNote className="h-4 w-4 text-indigo-600" aria-hidden="true" />
              {t("notes.widget.title")}
            </div>
            <div className="flex items-center gap-1">
              <Link
                to="/MyNotes"
                className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs text-indigo-600 hover:bg-indigo-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:hover:bg-slate-800"
              >
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                {t("notes.widget.viewAll")}
              </Link>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={t("notes.widget.close")}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:hover:bg-slate-700"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>

          {/* Kapsam seçimi */}
          <div className="flex gap-1 px-3 pt-2">
            {questionId ? (
              <button
                type="button"
                onClick={() => setScope("question")}
                className={
                  "min-h-8 rounded-full px-3 py-1 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 " +
                  (scope === "question"
                    ? "bg-indigo-600 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300")
                }
              >
                {t("notes.widget.scopeQuestion")}
                {questionOrder ? ` · ${t("notes.widget.questionShort", { order: questionOrder })}` : ""}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setScope("general")}
              className={
                "min-h-8 rounded-full px-3 py-1 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 " +
                (scope === "general"
                  ? "bg-indigo-600 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300")
              }
            >
              {t("notes.widget.scopeGeneral")}
            </button>
          </div>

          {/* Adres ipucu */}
          {scope === "question" && testTitle ? (
            <p className="truncate px-4 pt-1.5 text-[11px] text-slate-400" title={testTitle}>
              {testTitle}
            </p>
          ) : null}

          {/* Akış */}
          <div className="max-h-64 min-h-[6rem] overflow-y-auto px-3 py-2">
            {threadLoading ? (
              <div className="flex items-center justify-center py-6 text-slate-400">
                <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
              </div>
            ) : items.length === 0 ? (
              <p className="py-6 text-center text-xs text-slate-400">{t("notes.widget.empty")}</p>
            ) : (
              <ul className="space-y-2">
                {items.map((n) => (
                  <li
                    key={n.id}
                    className="rounded-xl bg-indigo-50 px-3 py-2 text-sm text-slate-800 dark:bg-slate-800 dark:text-slate-100"
                  >
                    {n.questionOrder ? (
                      <span className="mb-0.5 block text-[10px] font-medium uppercase tracking-wide text-indigo-500">
                        {t("notes.widget.questionShort", { order: n.questionOrder })}
                      </span>
                    ) : null}
                    <span className="whitespace-pre-wrap break-words">{n.body}</span>
                  </li>
                ))}
                <li ref={threadEndRef} aria-hidden="true" />
              </ul>
            )}
          </div>

          {/* Yazma alanı */}
          <form onSubmit={handleSubmit} className="flex items-end gap-2 border-t border-slate-100 p-3 dark:border-slate-800">
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") handleSubmit(e);
              }}
              rows={2}
              maxLength={5000}
              placeholder={t("notes.widget.placeholder")}
              aria-label={t("notes.widget.placeholder")}
              className="min-h-[2.5rem] resize-none text-sm"
            />
            <Button
              type="submit"
              size="icon"
              disabled={!text.trim() || createNote.isPending}
              aria-label={t("notes.widget.save")}
            >
              {createNote.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Send className="h-4 w-4" aria-hidden="true" />
              )}
            </Button>
          </form>
        </div>
      ) : (
        <Button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-full shadow-lg"
          aria-label={t("notes.widget.fab")}
        >
          <StickyNote className="mr-1.5 h-4 w-4" aria-hidden="true" />
          {t("notes.widget.fab")}
        </Button>
      )}
    </div>
  );
}
