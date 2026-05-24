import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { liveSessions as liveApi } from "@/api/dalClient";
import { useAuth } from "@/lib/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createPageUrl } from "@/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Zap, Plus, Users, Clock, CheckCircle2,
  FileEdit, ChevronRight, Radio, Eye, Pencil, Play,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { tr } from "date-fns/locale";

// status label artık i18n key — render anında t() ile çözülür.
const STATUS_CONFIG = {
  DRAFT:  { labelKey: "pages:myLiveSessions.status.draft",  color: "bg-slate-100 text-slate-600",     icon: FileEdit    },
  ACTIVE: { labelKey: "pages:myLiveSessions.status.active", color: "bg-emerald-100 text-emerald-700", icon: Radio       },
  ENDED:  { labelKey: "pages:myLiveSessions.status.ended",  color: "bg-blue-100 text-blue-700",       icon: CheckCircle2 },
};

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
  const cfg        = STATUS_CONFIG[session.status] ?? STATUS_CONFIG.DRAFT;
  const StatusIcon = cfg.icon;
  const qCount     = session.questions?.length ?? session._count?.questions ?? 0;
  const pCount     = session.participants?.length ?? session._count?.participants ?? 0;
  const isEnded    = session.status === "ENDED";
  const isActive   = session.status === "ACTIVE";
  const isDraft    = session.status === "DRAFT";

  // Tur 2'nin durumu (varsa)
  const r2Status = round2?.status;
  const r2Ended  = r2Status === "ENDED";

  return (
    <Card className="border-slate-200 hover:shadow-md transition-shadow">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
              isActive ? "bg-emerald-100" :
              isEnded  ? "bg-blue-100"    : "bg-slate-100"
            }`}>
              <StatusIcon className={`w-5 h-5 ${
                isActive ? "text-emerald-600" :
                isEnded  ? "text-blue-600"    : "text-slate-500"
              }`} />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <h3 className="font-semibold text-slate-900 truncate">{session.title}</h3>
                <Badge className={cfg.color}>{t(cfg.labelKey)}</Badge>
                {round2 && (
                  <Badge className="bg-indigo-100 text-indigo-700">
                    {r2Ended
                      ? t("pages:myLiveSessions.round2.completedBadge")
                      : r2Status === "ACTIVE"
                      ? t("pages:myLiveSessions.round2.activeBadge")
                      : t("pages:myLiveSessions.round2.draftBadge")}
                  </Badge>
                )}
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

              {/* Katılım kodu — DRAFT/ACTIVE turlarda göster */}
              {(isDraft || isActive) && session.joinCode && (
                <div className="mt-2 inline-flex items-center gap-1.5 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1">
                  <span className="text-xs text-amber-600 font-medium">{t("pages:myLiveSessions.card.joinCode")}</span>
                  <span className="text-sm font-mono font-bold text-amber-800 tracking-widest">
                    {session.joinCode}
                  </span>
                </div>
              )}

              {/* Tur 2 katılım kodu — Tur 1 ENDED + Tur 2 DRAFT/ACTIVE */}
              {isEnded && round2 && !r2Ended && round2.joinCode && (
                <div className="mt-2 inline-flex items-center gap-1.5 bg-indigo-50 border border-indigo-200 rounded-lg px-2.5 py-1">
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
                  className="gap-1"
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
                className="bg-emerald-600 hover:bg-emerald-700 gap-1"
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
                    className="gap-1"
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
                    className="bg-emerald-600 hover:bg-emerald-700 gap-1"
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

export default function MyLiveSessions() {
  const { t } = useTranslation(["pages"]);
  const { user }       = useAuth();
  const navigate       = useNavigate();
  const queryClient    = useQueryClient();

  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ["myLiveSessions"],
    queryFn: () => liveApi.listMy(),
    enabled: !!user,
  });

  // Tur 2 oturumlarını parent altında grupla — listede ayrı satır olarak görünmesinler
  const { parentSessions, round2ByParent } = useMemo(() => {
    const r2Map = new Map();
    for (const s of sessions) {
      if (s.roundNumber === 2 && s.parentSessionId) {
        r2Map.set(s.parentSessionId, s);
      }
    }
    const parents = sessions.filter((s) => s.roundNumber !== 2);
    return { parentSessions: parents, round2ByParent: r2Map };
  }, [sessions]);

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

  const draft  = parentSessions.filter((s) => s.status === "DRAFT");
  const active = parentSessions.filter((s) => s.status === "ACTIVE");
  const ended  = parentSessions.filter((s) => s.status === "ENDED");

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

  const renderList = (list) => (
    <div className="space-y-3">
      {list.map((s) => (
        <SessionCard
          key={s.id}
          session={s}
          round2={round2ByParent.get(s.id) ?? null}
          onOpenHost={goToHost}
          onEdit={goToHost}
          onStartRound1={(id) => {
            if (confirm(t("pages:myLiveSessions.confirms.startRound1")))
              startRound1Mut.mutate(id);
          }}
          onStartRound2={(parentId, existingRound2) => {
            if (confirm(t("pages:myLiveSessions.confirms.startRound2")))
              startRound2Mut.mutate({ parentId, existingRound2 });
          }}
          starting={starting}
        />
      ))}
    </div>
  );

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
        </div>
        <Button onClick={goToCreate} className="bg-amber-500 hover:bg-amber-600 gap-2 shrink-0">
          <Plus className="w-4 h-4" />
          {t("pages:myLiveSessions.newButton")}
        </Button>
      </div>

      {parentSessions.length === 0 && (
        <div className="text-center py-20">
          <div className="w-20 h-20 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <Zap className="w-10 h-10 text-amber-400" />
          </div>
          <h2 className="text-xl font-semibold text-slate-900 mb-2">
            {t("pages:myLiveSessions.empty.title")}
          </h2>
          <p className="text-slate-500 mb-6 max-w-sm mx-auto">
            {t("pages:myLiveSessions.empty.desc")}
          </p>
          <Button onClick={goToCreate} className="bg-amber-500 hover:bg-amber-600 gap-2">
            <Plus className="w-4 h-4" />
            {t("pages:myLiveSessions.empty.firstButton")}
          </Button>
        </div>
      )}

      {active.length > 0 && (
        <section className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <h2 className="text-sm font-semibold text-emerald-700 uppercase tracking-wide">
              {t("pages:myLiveSessions.sections.active", { count: active.length })}
            </h2>
          </div>
          {renderList(active)}
        </section>
      )}

      {draft.length > 0 && (
        <section className="mb-6">
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">
            {t("pages:myLiveSessions.sections.draft", { count: draft.length })}
          </h2>
          {renderList(draft)}
        </section>
      )}

      {ended.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">
            {t("pages:myLiveSessions.sections.ended", { count: ended.length })}
          </h2>
          {renderList(ended)}
        </section>
      )}
    </div>
  );
}
