import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { liveSessions as liveApi } from "@/api/dalClient";
import { useAuth } from "@/lib/AuthContext";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createPageUrl } from "@/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Zap, Plus, Users, Clock, CheckCircle2,
  FileEdit, ChevronRight, Radio, Eye, Pencil, Play, HelpCircle,
} from "lucide-react";
import { LiveSessionInfoModal, useLiveSessionIntro } from "@/components/live/LiveSessionInfoModal";
import { toast } from "sonner";
import { format } from "date-fns";
import { tr } from "date-fns/locale";

// Tek badge — tur 1 + tur 2 durumlarını efektif tek bir state'e indirir.
// 5 efektif state: draft | active | round1Completed | round2Active | round2Completed.
// İki ayrı badge yerine kullanıcının görmek istediği tek özet etiket.
const EFFECTIVE_STATUS = {
  draft: {
    labelKey: "pages:myLiveSessions.status.draft",
    badge:    "bg-transparent text-slate-600",
    avatarBg: "bg-slate-100",
    avatarFg: "text-slate-500",
    icon:     FileEdit,
  },
  active: {
    labelKey: "pages:myLiveSessions.status.active",
    badge:    "bg-transparent text-emerald-700",
    avatarBg: "bg-emerald-100",
    avatarFg: "text-emerald-600",
    icon:     Radio,
  },
  round1Completed: {
    labelKey: "pages:myLiveSessions.status.round1Completed",
    badge:    "bg-transparent text-blue-700",
    avatarBg: "bg-blue-100",
    avatarFg: "text-blue-600",
    icon:     CheckCircle2,
  },
  round2Active: {
    labelKey: "pages:myLiveSessions.status.round2Active",
    badge:    "bg-transparent text-emerald-700",
    avatarBg: "bg-emerald-100",
    avatarFg: "text-emerald-600",
    icon:     Radio,
  },
  round2Completed: {
    labelKey: "pages:myLiveSessions.status.round2Completed",
    badge:    "bg-transparent text-indigo-700",
    avatarBg: "bg-indigo-100",
    avatarFg: "text-indigo-600",
    icon:     CheckCircle2,
  },
};

/**
 * Tur 1 + Tur 2 durumlarından tek efektif state üretir.
 * Tur 2 varsa onun durumu önceliklidir (en güncel aşama).
 * Tur 2 DRAFT ise henüz başlatılmadığından "round1Completed" gösterilir.
 */
function getEffectiveStatus(session, round2) {
  if (round2?.status === "ENDED")  return "round2Completed";
  if (round2?.status === "ACTIVE") return "round2Active";
  if (session.status === "ENDED")  return "round1Completed";
  if (session.status === "ACTIVE") return "active";
  return "draft";
}

function safeDate(iso) {
  if (!iso) return null;
  try { return format(new Date(iso), "d MMM yyyy HH:mm", { locale: tr }); }
  catch { return null; }
}

/**
 * Oturum kartı — Tur 1 (parent) için tüm yaşam döngüsünü tek satırda yönetir.
 *
 * Sıralı oturum kuralı:
 *  - Tur 1 DRAFT          → [Düzenle] [1. Oturumu Başlat]
 *  - Tur 1 ACTIVE         → [1. Oturumu Yönet]
 *  - Tur 1 ENDED, Tur 2 yok        → [Tur 1'i İncele] [2. Oturumu Başlat]  (createRound2 + start)
 *  - Tur 1 ENDED, Tur 2 DRAFT      → [Tur 1'i İncele] [2. Oturumu Başlat]  (start)
 *  - Tur 1 ENDED, Tur 2 ACTIVE     → [Tur 1'i İncele] [2. Oturumu Yönet]
 *  - Tur 1 ENDED, Tur 2 ENDED      → [Tur 1'i İncele] [Tur 2'yi İncele]
 *
 * "Başlat" = backend liveApi.start (DRAFT → ACTIVE) ve ardından host sayfasına.
 * "Düzenle" = DRAFT'ta host sayfasına gider (host orada içerik düzenlenebilir
 * gösterimi sağlar; backend update endpoint'i ileride eklenince inline edit'e
 * geçilebilir).
 */
function SessionCard({ session, round2, onOpenHost, onEdit, onStartRound1, onStartRound2, starting }) {
  const { t } = useTranslation(["pages"]);
  const effective  = getEffectiveStatus(session, round2);
  const cfg        = EFFECTIVE_STATUS[effective];
  const StatusIcon = cfg.icon;
  const qCount     = session.questions?.length ?? session._count?.questions ?? 0;
  const pCount     = session.participants?.length ?? session._count?.participants ?? 0;
  const isEnded    = session.status === "ENDED";
  const isActive   = session.status === "ACTIVE";
  const isDraft    = session.status === "DRAFT";

  // Tur 2'nin durumu (varsa) — buton koşulları için
  const r2Status = round2?.status;
  const r2Ended  = r2Status === "ENDED";

  return (
    <Card className="border-slate-200 hover:shadow-md transition-shadow">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${cfg.avatarBg}`}>
              <StatusIcon className={`w-5 h-5 ${cfg.avatarFg}`} />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <h3 className="font-semibold text-slate-900 truncate">{session.title}</h3>
                <Badge className={cfg.badge}>{t(cfg.labelKey)}</Badge>
              </div>

              <div className="flex items-center gap-4 text-xs text-slate-500 flex-wrap">
                <span className="flex items-center gap-1">
                  <Zap className="w-3 h-3" />
                  {t("pages:myLiveSessions.card.questions", { count: qCount })}
                </span>
                {pCount > 0 && (
                  <span className="flex items-center gap-1">
                    <Users className="w-3 h-3" />
                    {t("pages:myLiveSessions.card.participants", { count: pCount })}
                  </span>
                )}
                {session.tier?.label && (
                  <span className="flex items-center gap-1">
                    <Users className="w-3 h-3" />
                    {session.tier.label}
                  </span>
                )}
                {session.createdAt && (
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {safeDate(session.createdAt)}
                  </span>
                )}
              </div>

              {/* Katılım kodu — DRAFT/ACTIVE turlarda göster.
                  Saydam fon, sadece sol kenarda renk şeridi. Çerçeve yok. */}
              {(isDraft || isActive) && session.joinCode && (
                <div className="mt-2 inline-flex items-center gap-1.5 border-l-2 border-amber-300 pl-2 pr-2 py-1">
                  <span className="text-xs text-amber-600 font-medium">{t("pages:myLiveSessions.card.joinCode")}</span>
                  <span className="text-sm font-mono font-bold text-amber-800 tracking-widest">
                    {session.joinCode}
                  </span>
                </div>
              )}

              {/* Tur 2 katılım kodu — Tur 1 ENDED + Tur 2 DRAFT/ACTIVE */}
              {isEnded && round2 && !r2Ended && round2.joinCode && (
                <div className="mt-2 inline-flex items-center gap-1.5 border-l-2 border-indigo-300 pl-2 pr-2 py-1">
                  <span className="text-xs text-indigo-600 font-medium">{t("pages:myLiveSessions.card.round2JoinCode")}</span>
                  <span className="text-sm font-mono font-bold text-indigo-800 tracking-widest">
                    {round2.joinCode}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Sağ aksiyon alanı — duruma göre */}
          <div className="flex flex-col items-end gap-2 shrink-0">
            {/* ── Tur 1 DRAFT: Düzenle + 1. Oturumu Başlat ─────────────── */}
            {isDraft && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onEdit(session.id)}
                  className="gap-1"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  {t("pages:myLiveSessions.card.edit")}
                </Button>
                <Button
                  size="sm"
                  className="bg-blue-600 hover:bg-blue-700 text-white gap-1"
                  onClick={() => onStartRound1(session.id)}
                  disabled={starting}
                >
                  <Play className="w-3.5 h-3.5" />
                  {t("pages:myLiveSessions.card.startRound1")}
                </Button>
              </>
            )}

            {/* ── Tur 1 ACTIVE: yönet ───────────────────────────────────── */}
            {isActive && (
              <Button
                size="sm"
                className="bg-blue-600 hover:bg-blue-700 text-white gap-1"
                onClick={() => onOpenHost(session.id)}
              >
                <ChevronRight className="w-3.5 h-3.5" />
                {t("pages:myLiveSessions.card.manageRound1")}
              </Button>
            )}

            {/* ── Tur 1 ENDED: tek İncele + 2. tur aksiyonu ─────────────── */}
            {isEnded && (
              <>
                {/* Tek 'İncele' butonu — Tur 1 host sayfasında her iki turun
                    cevaplama oranı + karşılaştırma zaten birlikte görünüyor;
                    'Tur 1 İncele' + 'Tur 2 İncele' duplikasyonu kaldırıldı. */}
                <Button size="sm" variant="outline" onClick={() => onOpenHost(session.id)} className="gap-1">
                  <Eye className="w-3.5 h-3.5" />
                  {t("pages:myLiveSessions.card.review")}
                </Button>

                {/* Tur 2 yok veya DRAFT → "2. Oturumu Başlat" (createRound2 gerekirse + start) */}
                {(!round2 || round2.status === "DRAFT") && (
                  <Button
                    size="sm"
                    className="bg-blue-600 hover:bg-blue-700 text-white gap-1"
                    onClick={() => onStartRound2(session.id, round2)}
                    disabled={starting}
                  >
                    <Play className="w-3.5 h-3.5" />
                    {t("pages:myLiveSessions.card.startRound2")}
                  </Button>
                )}

                {/* Tur 2 ACTIVE → "2. Oturumu Yönet" */}
                {round2 && round2.status === "ACTIVE" && (
                  <Button
                    size="sm"
                    className="bg-blue-600 hover:bg-blue-700 text-white gap-1"
                    onClick={() => onOpenHost(round2.id)}
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                    {t("pages:myLiveSessions.card.manageRound2")}
                  </Button>
                )}
                {/* Tur 2 ENDED → ek bir buton yok; tek İncele yeterli (kullanıcı tercihi). */}
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

const STATUS_FILTERS = ["ALL", "DRAFT", "ACTIVE", "ENDED"];

export default function MyLiveSessions() {
  const { t } = useTranslation(["pages"]);
  const { user }       = useAuth();
  const navigate       = useNavigate();
  const queryClient    = useQueryClient();

  const [statusFilter, setStatusFilter] = useState("ALL");
  // "Canlı Test Nedir?" bilgilendirme pop-up'ı (Tünel intro deseni, ilk açılışta otomatik)
  const liveIntro = useLiveSessionIntro(true);
  // Başlat onay dialog'u — native window.confirm yerine projedeki shadcn Dialog
  // ile tutarlı görünüm. State: null veya { kind: 'round1'|'round2', sessionId, existingRound2? }
  const [confirmStart, setConfirmStart] = useState(null);

  // Cursor pagination — backend her sayfa için {items, round2, nextCursor} döner.
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
  } = useInfiniteQuery({
    queryKey: ["myLiveSessions", statusFilter],
    queryFn: ({ pageParam }) =>
      liveApi.listMy({
        cursor: pageParam,
        status: statusFilter === "ALL" ? undefined : statusFilter,
        limit: 20,
      }),
    enabled: !!user,
    initialPageParam: null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    staleTime: 30_000,
  });

  // Tüm sayfaları düz listeye çevir + round 2'leri parent'a eşle.
  const { parentSessions, round2ByParent } = useMemo(() => {
    const pages = data?.pages ?? [];
    const parents = pages.flatMap((p) => p.items);
    const r2Map = new Map();
    for (const p of pages) {
      for (const s of p.round2 ?? []) {
        if (s.parentSessionId) r2Map.set(s.parentSessionId, s);
      }
    }
    return { parentSessions: parents, round2ByParent: r2Map };
  }, [data]);

  // Tur 1 başlatma: DRAFT → ACTIVE; sonra host sayfasına git.
  const startRound1Mut = useMutation({
    mutationFn: (id) => liveApi.start(id),
    onSuccess: (data, id) => {
      toast.success(t("pages:myLiveSessions.toasts.round1Started"));
      queryClient.invalidateQueries({ queryKey: ["myLiveSessions"] });
      navigate(createPageUrl("LiveSessionHost") + "?id=" + (data?.id ?? id));
    },
    onError: (e) => {
      const d = e?.response?.data;
      toast.error(d?.error?.message || d?.message || t("pages:myLiveSessions.toasts.startFailed"));
    },
  });

  // Tur 2 başlatma: round 2 yoksa önce createRound2 + start; varsa DRAFT'ı start.
  const startRound2Mut = useMutation({
    mutationFn: async ({ parentId, existingRound2 }) => {
      let r2 = existingRound2;
      if (!r2) {
        r2 = await liveApi.createRound2(parentId);
      }
      const targetId = r2?.id ?? r2?.sessionId;
      if (!targetId) throw new Error("ROUND2_ID_MISSING");
      // Yeni oluşturulan veya DRAFT round 2'yi ACTIVE'ye geçir
      const started = await liveApi.start(targetId);
      return { ...r2, ...started };
    },
    onSuccess: (data) => {
      toast.success(t("pages:myLiveSessions.toasts.round2Started"));
      queryClient.invalidateQueries({ queryKey: ["myLiveSessions"] });
      const newId = data?.id ?? data?.sessionId;
      if (newId) navigate(createPageUrl("LiveSessionHost") + "?id=" + newId);
    },
    onError: (e) => {
      const d = e?.response?.data;
      toast.error(d?.error?.message || d?.message || t("pages:myLiveSessions.toasts.startFailed"));
    },
  });

  const starting = startRound1Mut.isPending || startRound2Mut.isPending;

  const goToHost   = (id) => navigate(createPageUrl("LiveSessionHost") + "?id=" + id);
  const goToCreate = () => navigate(createPageUrl("LiveSessionCreate"));

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto space-y-3 pt-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 bg-slate-100 rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-start justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Zap className="w-6 h-6 text-amber-500" />
            {t("pages:titles.myLiveSessions")}
          </h1>
          <p className="text-slate-500 mt-1 text-sm">
            {t("pages:myLiveSessions.subtitle")}
          </p>
          <button
            type="button"
            onClick={() => liveIntro.setOpen(true)}
            className="mt-2 inline-flex items-center gap-1 px-2 py-1 min-h-10 text-xs font-medium text-amber-600 hover:text-amber-700"
          >
            <HelpCircle className="h-4 w-4" aria-hidden="true" /> {t("pages:liveSessionInfo.trigger")}
          </button>
        </div>
        <Button onClick={goToCreate} className="bg-amber-500 hover:bg-amber-600 gap-2 shrink-0">
          <Plus className="w-4 h-4" />
          {t("pages:myLiveSessions.newButton")}
        </Button>
      </div>

      <LiveSessionInfoModal open={liveIntro.open} onClose={() => liveIntro.setOpen(false)} />

      {/* Filtre sekmeleri — pagination cursor'ı statusFilter ile resetlenir
          (queryKey ['myLiveSessions', statusFilter]). */}
      <div className="flex flex-wrap items-center gap-1 mb-6 border-b border-slate-200 dark:border-gray-800">
        {STATUS_FILTERS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatusFilter(s)}
            className={`inline-flex items-center gap-2 px-4 py-2.5 min-h-10 text-sm font-medium border-b-2 -mb-px transition-colors ${
              statusFilter === s
                ? "border-indigo-600 text-indigo-600 dark:text-indigo-400"
                : "border-transparent text-slate-600 hover:text-slate-900 dark:text-gray-400 dark:hover:text-gray-100"
            }`}
          >
            {t(`pages:myLiveSessions.filters.${s.toLowerCase()}`)}
          </button>
        ))}
      </div>

      {parentSessions.length === 0 && (
        <div className="text-center py-20">
          <div className="w-20 h-20 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <Zap className="w-10 h-10 text-amber-400" />
          </div>
          <h2 className="text-xl font-semibold text-slate-900 mb-2">
            {statusFilter === "ALL"
              ? t("pages:myLiveSessions.empty.title")
              : t("pages:myLiveSessions.empty.filteredTitle")}
          </h2>
          <p className="text-slate-500 mb-6 max-w-sm mx-auto">
            {statusFilter === "ALL"
              ? t("pages:myLiveSessions.empty.desc")
              : t("pages:myLiveSessions.empty.filteredDesc")}
          </p>
          {statusFilter === "ALL" && (
            <Button onClick={goToCreate} className="bg-amber-500 hover:bg-amber-600 gap-2">
              <Plus className="w-4 h-4" />
              {t("pages:myLiveSessions.empty.firstButton")}
            </Button>
          )}
        </div>
      )}

      {/* Tek liste — filtre + cursor pagination */}
      {parentSessions.length > 0 && (
        <div className="space-y-3">
          {parentSessions.map((s) => (
            <SessionCard
              key={s.id}
              session={s}
              round2={round2ByParent.get(s.id) ?? null}
              onOpenHost={goToHost}
              onEdit={goToHost}
              onStartRound1={(id) => setConfirmStart({ kind: 'round1', sessionId: id })}
              onStartRound2={(parentId, existingRound2) =>
                setConfirmStart({ kind: 'round2', sessionId: parentId, existingRound2 })
              }
              starting={starting}
            />
          ))}
        </div>
      )}

      {/* Daha fazla göster — cursor sonu null değilse */}
      {hasNextPage && (
        <div className="flex justify-center mt-6">
          <Button
            variant="outline"
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
          >
            {isFetchingNextPage
              ? t("pages:myLiveSessions.loading")
              : t("pages:myLiveSessions.loadMore")}
          </Button>
        </div>
      )}

      {/* Oturum başlatma onay dialog'u — native window.confirm yerine projedeki
          shadcn Dialog. round1 ve round2 için aynı bileşen, sadece metin değişir. */}
      <Dialog open={!!confirmStart} onOpenChange={(o) => { if (!o) setConfirmStart(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {confirmStart?.kind === 'round2'
                ? t("pages:myLiveSessions.card.startRound2")
                : t("pages:myLiveSessions.card.startRound1")}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-600 whitespace-pre-line">
            {confirmStart?.kind === 'round2'
              ? t("pages:myLiveSessions.confirms.startRound2")
              : t("pages:myLiveSessions.confirms.startRound1")}
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setConfirmStart(null)} disabled={starting}>
              {t("pages:testForm.testCard.deleteConfirmCancel")}
            </Button>
            <Button
              className="bg-blue-600 hover:bg-blue-700 text-white gap-1"
              disabled={starting}
              onClick={() => {
                if (!confirmStart) return;
                if (confirmStart.kind === 'round1') {
                  startRound1Mut.mutate(confirmStart.sessionId);
                } else {
                  startRound2Mut.mutate({
                    parentId: confirmStart.sessionId,
                    existingRound2: confirmStart.existingRound2,
                  });
                }
                setConfirmStart(null);
              }}
            >
              <Play className="w-4 h-4" aria-hidden="true" />
              {confirmStart?.kind === 'round2'
                ? t("pages:myLiveSessions.card.startRound2")
                : t("pages:myLiveSessions.card.startRound1")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
