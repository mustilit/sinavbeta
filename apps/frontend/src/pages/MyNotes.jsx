import { useState, useEffect, useDeferredValue } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  StickyNote,
  Search,
  Pencil,
  Trash2,
  Check,
  X,
  Loader2,
  BookOpen,
  Layers,
  GraduationCap,
  FileDown,
} from "lucide-react";
import { exportNotesPdf, collectAllNotes } from "@/lib/notesPdf";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Pagination } from "@/components/ui/Pagination";
import { notes as notesApi } from "@/api/dalClient";
import { format } from "date-fns";

const ALL = "__all__";
const GENERAL = "__general__"; // adres taşımayan serbest ("Genel") notlar

/**
 * Soru metnini sadeleştirir: "Soru N:" öncesindeki prefix'i (sınav türü/test vb.
 * — zaten üstte etiketlerde var) kırpar. "Soru N:" bulunmazsa metni olduğu gibi
 * döndürür (her soru bu seed formatında değil).
 */
function cleanExcerpt(text) {
  if (!text) return text;
  const m = text.match(/Soru\s*\d+\s*[:.)-]/i);
  return m && m.index > 0 ? text.slice(m.index) : text;
}

/**
 * Notlarım — adayın tüm notları adresli (sınav türü / konu / test / soru) listelenir.
 * Konu, test, sınav türü ve metin filtreleri; cursor sayfalama; düzenle/sil.
 */
export default function MyNotes() {
  const { t } = useTranslation(["pages"]);
  const queryClient = useQueryClient();

  const [topicId, setTopicId] = useState(ALL);
  const [testId, setTestId] = useState(ALL);
  const [examTypeId, setExamTypeId] = useState(ALL);
  const [search, setSearch] = useState("");
  const q = useDeferredValue(search);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState("");
  const [deleteId, setDeleteId] = useState(null);
  const [exporting, setExporting] = useState(false);

  const { data: facets } = useQuery({
    queryKey: ["noteFacets"],
    queryFn: () => notesApi.facets(),
    staleTime: 30_000,
  });

  // "Genel" seçilince adres filtreleri (konu/test/sınav türü) anlamsız → scope='general'
  const isGeneral = examTypeId === GENERAL;
  const filters = isGeneral
    ? { scope: "general", q: q.trim() || undefined }
    : {
        topicId: topicId === ALL ? undefined : topicId,
        testId: testId === ALL ? undefined : testId,
        examTypeId: examTypeId === ALL ? undefined : examTypeId,
        q: q.trim() || undefined,
      };

  // Filtre değişince ilk sayfaya dön
  useEffect(() => {
    setPage(1);
  }, [topicId, testId, examTypeId, q]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["myNotes", filters, page, pageSize],
    queryFn: () => notesApi.list({ ...filters, page, pageSize }),
    placeholderData: (prev) => prev, // sayfa değişiminde liste zıplamasın
    staleTime: 10_000,
  });

  const updateNote = useMutation({
    mutationFn: ({ id, body }) => notesApi.update(id, body),
    onSuccess: () => {
      toast.success(t("notes.page.updated"));
      setEditingId(null);
      queryClient.invalidateQueries({ queryKey: ["myNotes"] });
      queryClient.invalidateQueries({ queryKey: ["noteThread"] });
    },
    onError: () => toast.error(t("notes.page.error")),
  });

  const deleteNote = useMutation({
    mutationFn: (id) => notesApi.remove(id),
    onSuccess: () => {
      toast.success(t("notes.page.deleted"));
      setDeleteId(null);
      queryClient.invalidateQueries({ queryKey: ["myNotes"] });
      queryClient.invalidateQueries({ queryKey: ["noteFacets"] });
      queryClient.invalidateQueries({ queryKey: ["noteThread"] });
    },
    onError: () => toast.error(t("notes.page.error")),
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const hasAnyFilter =
    topicId !== ALL || testId !== ALL || examTypeId !== ALL || q.trim().length > 0;

  // PDF: filtreye uyan TÜM notları çek (sayfa değil) → tek dosyada dışa aktar.
  const exportPdf = async () => {
    setExporting(true);
    try {
      const all = await collectAllNotes(notesApi.list, filters);
      await exportNotesPdf({ items: all, title: t("notes.page.title"), subtitle: "Sınav Salonu" });
    } catch (e) {
      console.error("Notlar PDF export hatası:", e);
      toast.error(t("notes.page.error"));
    } finally {
      setExporting(false);
    }
  };

  const clearFilters = () => {
    setExamTypeId(ALL);
    setTopicId(ALL);
    setTestId(ALL);
    setSearch("");
  };

  const startEdit = (note) => {
    setEditingId(note.id);
    setEditText(note.body);
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <header className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900 dark:text-slate-100">
            <StickyNote className="h-6 w-6 text-indigo-600" aria-hidden="true" />
            {t("notes.page.title")}
          </h1>
          <p className="mt-1 text-sm text-slate-500">{t("notes.page.subtitle")}</p>
        </div>
        <Button variant="outline" className="gap-2 shrink-0" disabled={exporting || total === 0} onClick={exportPdf}>
          {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />} {t("notes.page.exportPdf")}
        </Button>
      </header>

      {/* Filtreler */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="grid w-full flex-1 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("notes.page.filters.searchPlaceholder")}
            aria-label={t("notes.page.filters.search")}
            className="pl-9"
          />
        </div>

        <Select
          value={examTypeId}
          onValueChange={(v) => {
            setExamTypeId(v);
            // "Genel" seçilince adres filtrelerini sıfırla (anlamsızlar)
            if (v === GENERAL) {
              setTopicId(ALL);
              setTestId(ALL);
            }
          }}
        >
          <SelectTrigger aria-label={t("notes.page.filters.examType")}>
            <SelectValue placeholder={t("notes.page.filters.examType")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t("notes.page.filters.allExamTypes")}</SelectItem>
            <SelectItem value={GENERAL}>{t("notes.page.filters.general")}</SelectItem>
            {(facets?.examTypes ?? []).map((e) => (
              <SelectItem key={e.id} value={e.id}>
                {e.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={topicId} onValueChange={setTopicId} disabled={isGeneral}>
          <SelectTrigger aria-label={t("notes.page.filters.topic")}>
            <SelectValue placeholder={t("notes.page.filters.topic")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t("notes.page.filters.allTopics")}</SelectItem>
            {(facets?.topics ?? []).map((tp) => (
              <SelectItem key={tp.id} value={tp.id}>
                {tp.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={testId} onValueChange={setTestId} disabled={isGeneral}>
          <SelectTrigger aria-label={t("notes.page.filters.test")}>
            <SelectValue placeholder={t("notes.page.filters.test")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t("notes.page.filters.allTests")}</SelectItem>
            {(facets?.tests ?? []).map((ts) => (
              <SelectItem key={ts.id} value={ts.id}>
                {ts.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        </div>

        {hasAnyFilter ? (
          <Button
            variant="ghost"
            onClick={clearFilters}
            className="ml-auto shrink-0 text-slate-500 hover:text-slate-700"
          >
            <X className="mr-1.5 h-4 w-4" aria-hidden="true" />
            {t("notes.page.filters.clear")}
          </Button>
        ) : null}
      </div>

      {/* Liste */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl border border-slate-100 bg-white dark:border-slate-800 dark:bg-slate-900" />
          ))}
        </div>
      ) : isError ? (
        <p className="py-10 text-center text-sm text-red-600" role="alert">
          {t("notes.page.error")}
        </p>
      ) : items.length === 0 ? (
        <div className="py-16 text-center">
          <StickyNote className="mx-auto mb-3 h-10 w-10 text-slate-300" aria-hidden="true" />
          <p className="text-sm text-slate-500">
            {hasAnyFilter ? t("notes.page.emptyFiltered") : t("notes.page.empty")}
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((n) => {
            // Üst sıra: Sınav Türü · Sınav adı · Soru no · Konu (arka plan rengi yok)
            const addr = [];
            if (n.examTypeName)
              addr.push(
                <span className="inline-flex items-center gap-1" key="et">
                  <GraduationCap className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                  {n.examTypeName}
                </span>,
              );
            if (n.testTitle)
              addr.push(
                <span className="inline-flex items-center gap-1" key="t">
                  <BookOpen className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                  {n.testTitle}
                </span>,
              );
            if (n.questionOrder)
              addr.push(
                <span className="font-semibold text-indigo-600 dark:text-indigo-400" key="q">
                  {t("notes.page.questionLabel", { order: n.questionOrder })}
                </span>,
              );
            if (n.topicName)
              addr.push(
                <span className="inline-flex items-center gap-1" key="tp">
                  <Layers className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                  {n.topicName}
                </span>,
              );
            if (addr.length === 0)
              addr.push(
                <span className="text-slate-400" key="g">
                  {t("notes.page.addressGeneral")}
                </span>,
              );

            return (
            <li key={n.id}>
              <Card>
                <CardContent className="p-3">
                  {/* Üst sıra: adres (sol) + tarih (sağ) */}
                  <div className="mb-1 flex items-start justify-between gap-3">
                    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-600 dark:text-slate-300">
                      {addr.map((node, i) => (
                        <span className="inline-flex items-center gap-2" key={i}>
                          {i > 0 ? (
                            <span className="text-slate-300 dark:text-slate-600" aria-hidden="true">·</span>
                          ) : null}
                          {node}
                        </span>
                      ))}
                    </div>
                    <span className="shrink-0 text-xs text-slate-400">
                      {format(new Date(n.createdAt), "dd.MM.yyyy HH:mm")}
                    </span>
                  </div>

                  {/* Soru metni — uzasa bile tek satır, taşan kısım "..." ile kesilir */}
                  {n.questionExcerpt ? (
                    <p className="mb-1 truncate text-xs italic text-slate-400">
                      “{cleanExcerpt(n.questionExcerpt)}”
                    </p>
                  ) : null}

                  {/* Gövde / düzenleme */}
                  {editingId === n.id ? (
                    <div className="space-y-2">
                      <Textarea
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        rows={3}
                        maxLength={5000}
                        aria-label={t("notes.page.edit")}
                      />
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditingId(null)}
                          disabled={updateNote.isPending}
                        >
                          <X className="mr-1 h-4 w-4" aria-hidden="true" />
                          {t("notes.page.cancel")}
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => updateNote.mutate({ id: n.id, body: editText.trim() })}
                          disabled={!editText.trim() || updateNote.isPending}
                        >
                          {updateNote.isPending ? (
                            <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />
                          ) : (
                            <Check className="mr-1 h-4 w-4" aria-hidden="true" />
                          )}
                          {t("notes.page.save")}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    /* Gövde + aksiyonlar tek satırda (ayrı alt-bar yok → daha az yükseklik) */
                    <div className="flex items-start justify-between gap-2">
                      <p className="min-w-0 flex-1 whitespace-pre-wrap break-words text-sm text-slate-800 dark:text-slate-100">
                        {n.body}
                      </p>
                      <div className="flex shrink-0 gap-0.5">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => startEdit(n)}
                          aria-label={t("notes.page.edit")}
                          className="h-8 w-8"
                        >
                          <Pencil className="h-4 w-4" aria-hidden="true" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleteId(n.id)}
                          aria-label={t("notes.page.delete")}
                          className="h-8 w-8 text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </li>
            );
          })}
        </ul>
      )}

      {total > 0 ? (
        <div className="mt-4 overflow-hidden rounded-xl border border-slate-100 bg-white dark:border-slate-800 dark:bg-slate-900">
          <Pagination
            page={page}
            pageSize={pageSize}
            total={total}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
        </div>
      ) : null}

      {/* Silme onayı */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("notes.page.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("notes.page.deleteConfirm")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("notes.page.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && deleteNote.mutate(deleteId)}
              className="bg-red-600 hover:bg-red-700"
            >
              {t("notes.page.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
