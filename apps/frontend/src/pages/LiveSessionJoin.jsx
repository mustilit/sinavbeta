import { useState, useEffect } from "react";
import { liveSessions as liveApi } from "@/api/dalClient";
import { useAuth } from "@/lib/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { CheckCircle2, Zap, Users, Loader2, TrendingUp, TrendingDown, Minus, ZoomIn, X as XIcon, ShieldAlert } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Link, useSearchParams } from "react-router-dom";
import { createPageUrl } from "@/utils";

const LETTERS = ["A", "B", "C", "D", "E"];
const OPTION_COLORS = [
  "border-rose-400 bg-rose-50 hover:bg-rose-100",
  "border-blue-400 bg-blue-50 hover:bg-blue-100",
  "border-amber-400 bg-amber-50 hover:bg-amber-100",
  "border-emerald-400 bg-emerald-50 hover:bg-emerald-100",
  "border-violet-400 bg-violet-50 hover:bg-violet-100",
];
const OPTION_SELECTED = [
  "border-rose-500 bg-rose-500 text-white",
  "border-blue-500 bg-blue-500 text-white",
  "border-amber-500 bg-amber-500 text-white",
  "border-emerald-500 bg-emerald-500 text-white",
  "border-violet-500 bg-violet-500 text-white",
];
const LETTER_BG = [
  "bg-rose-500", "bg-blue-500", "bg-amber-500", "bg-emerald-500", "bg-violet-500"
];

/**
 * Bekleme odası + aktif test ekranını sidebar'ın üstüne kaplayan tam ekran katman.
 * Kullanıcı isteği: "kod giriş ekranında soldaki menüyü öldürme; teste atılır ya da
 * bekleme odasına alınırsa tam ekrana geçebilirsin." Bu yüzden kod giriş ve sonuç
 * (ENDED) ekranları normal Layout içinde (sidebar görünür) kalır; yalnızca DRAFT
 * (bekleme) ve ACTIVE (test) durumları bu overlay ile tam ekran olur.
 * Layout artık LiveSessionJoin'i FULLSCREEN_PAGES'te tutmuyor — kontrol burada.
 */
function FullscreenStage({ children }) {
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-50 dark:bg-gray-900">
      <div className="min-h-full px-4 py-8 lg:p-8">{children}</div>
    </div>
  );
}

export default function LiveSessionJoin() {
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [codeInput, setCodeInput] = useState(searchParams.get("code") ?? "");
  const [sessionId, setSessionId] = useState(null);
  const [lastQuestionId, setLastQuestionId] = useState(null);
  const [submittedOptionId, setSubmittedOptionId] = useState(null);
  // Görsel büyüteç (lightbox)
  const [lightboxUrl, setLightboxUrl] = useState(null);
  // Katılım engeli ekranı: SESSION_FULL (kontenjan dolu) / DEVICE_QUOTA_EXCEEDED (cihaz kotası)
  const [blocked, setBlocked] = useState(null);
  // Misafir (login'siz) katılım: görünen ad + oturuma özel kimlik token'ı.
  const [guestName, setGuestName] = useState("");
  const [guestToken, setGuestToken] = useState(null);

  // Misafir oturum sürdürme: sayfa yenilenirse aynı kodun saklı token'ıyla devam et
  // (yeni katılımcı oluşturup mükerrer kayıt/sayım yapmamak için).
  useEffect(() => {
    if (user) return;
    const code = (searchParams.get("code") ?? "").toUpperCase();
    if (!code) return;
    try {
      const raw = localStorage.getItem("liveGuest:" + code);
      if (raw) {
        const g = JSON.parse(raw);
        if (g?.sessionId && g?.token) { setSessionId(g.sessionId); setGuestToken(g.token); }
      }
    } catch { /* yoksay */ }
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  // İstemci kimliği: kayıtlı kullanıcı JWT'si VEYA misafir token'ı.
  const hasIdentity = !!user || !!guestToken;

  // Poll session state while joined
  const { data: state, isLoading: stateLoading } = useQuery({
    queryKey: ["liveJoinState", sessionId],
    queryFn: () => liveApi.getState(sessionId, guestToken),
    enabled: !!sessionId && hasIdentity,
    // 3s: yüksek katılımda sunucu yükünü ~%33 azaltır. Backend /state cache + eğitici
    // aksiyonlarında invalidation sayesinde soru geçişi yine ~anında yansır.
    refetchInterval: 3000,
  });

  // Heartbeat — ping every 15s so educator can see active count
  useEffect(() => {
    if (!sessionId || !hasIdentity || state?.status === "ENDED") return;
    // Ping immediately on join
    liveApi.ping(sessionId, guestToken).catch(() => {});
    const interval = setInterval(() => {
      liveApi.ping(sessionId, guestToken).catch(() => {});
    }, 15000);
    return () => clearInterval(interval);
  }, [sessionId, hasIdentity, guestToken, state?.status]);

  // Reset answer when question changes
  const currentQuestionId = state?.currentQuestion?.id;
  const myAnswer = state?.myAnswer;
  useEffect(() => {
    if (!currentQuestionId) return;
    if (currentQuestionId !== lastQuestionId) {
      setLastQuestionId(currentQuestionId);
      setSubmittedOptionId(myAnswer ?? null);
    }
  }, [currentQuestionId, lastQuestionId, myAnswer]);

  const joinMutation = useMutation({
    mutationFn: () => liveApi.join(codeInput.trim().toUpperCase(), user ? undefined : guestName.trim()),
    onSuccess: (data) => {
      setSessionId(data.sessionId);
      // Misafir ise dönen token'ı sakla (sonraki istekler + sayfa yenileme sürdürme).
      if (data.participantToken) {
        setGuestToken(data.participantToken);
        try {
          localStorage.setItem(
            "liveGuest:" + codeInput.trim().toUpperCase(),
            JSON.stringify({ sessionId: data.sessionId, token: data.participantToken }),
          );
        } catch { /* yoksay */ }
      }
      toast.success("Oturuma katıldınız!");
    },
    onError: (e) => {
      // http.js hata nesnesini normalize eder: e.code = backend error.code,
      // e.message = çözülmüş mesaj. Ham gövde { error: { code, message } }
      // kontratında (e.response.data.error.*) — bu yüzden ÖNCE e.code okunur.
      const code = e?.code ?? e?.response?.data?.error?.code;
      const message = e?.message ?? e?.response?.data?.error?.message;
      // Terminal katılım engelleri (kontenjan dolu / cihaz kotası) → kaybolan
      // toast yerine adanmış ekran. Diğer hatalar kısa toast.
      if (code === "SESSION_FULL" || code === "DEVICE_QUOTA_EXCEEDED") {
        setBlocked({ code, message });
      } else {
        toast.error(message || "Katılım başarısız");
      }
    },
  });

  const answerMutation = useMutation({
    mutationFn: ({ questionId, optionId }) =>
      liveApi.submitAnswer(sessionId, questionId, optionId, guestToken),
    onSuccess: (_, vars) => {
      setSubmittedOptionId(vars.optionId);
      queryClient.invalidateQueries({ queryKey: ["liveJoinState", sessionId] });
    },
    // http.js e.message'ı normalize eder; e.response.data.error.message ham gövde yedeği.
    onError: (e) => toast.error(e?.message || e?.response?.data?.error?.message || "Cevap gönderilemedi"),
  });

  const handleAnswer = (optionId) => {
    if (!state?.currentQuestion || state.status !== "ACTIVE") return;
    answerMutation.mutate({ questionId: state.currentQuestion.id, optionId });
  };

  // NOT: Login zorunluluğu kaldırıldı — misafir (login'siz) katılım link/karekod ile
  // mümkün. Kod giriş formunda ad alanı istenir; kayıtlı kullanıcılar JWT ile katılır.

  // ── Katılım engellendi: kontenjan dolu (SESSION_FULL) ya da aynı cihazdan kota
  //    aşımı (DEVICE_QUOTA_EXCEEDED). Aday henüz katılmadı → normal Layout (sidebar)
  //    içinde kalır; "Başka kod gir" ile koda dönebilir. Tam ekran DEĞİL.
  if (blocked) {
    const isFull = blocked.code === "SESSION_FULL";
    const Icon = isFull ? Users : ShieldAlert;
    return (
      <div className="max-w-sm mx-auto pt-16 text-center">
        <div className="bg-white rounded-2xl border border-slate-200 p-8">
          <div className="w-16 h-16 bg-rose-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Icon className="w-8 h-8 text-rose-500" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-1">
            {isFull ? "Kontenjan Dolu" : "Katılım Engellendi"}
          </h2>
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-rose-50 border border-rose-200 text-rose-700 text-sm font-medium mb-3 mt-1">
            <XIcon className="w-3.5 h-3.5" />
            {blocked.message || (isFull ? "Oturum dolu" : "Bu cihazdan katılım sınırına ulaşıldı")}
          </div>
          <p className="text-slate-500 text-sm mb-5">
            {isFull
              ? "Bu canlı testin katılımcı kontenjanı dolduğu için şu an katılamıyorsunuz. Eğiticinizle iletişime geçin."
              : "Aynı cihazdan bu oturuma izin verilen katılım sayısına ulaşıldı. Eğiticinizle iletişime geçin."}
          </p>
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => { setBlocked(null); setCodeInput(""); }}
          >
            <Zap className="w-4 h-4" /> Başka kod gir
          </Button>
        </div>
      </div>
    );
  }

  // ── Code entry ──
  if (!sessionId) {
    return (
      <div className="max-w-sm mx-auto pt-16">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-amber-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Zap className="w-8 h-8 text-amber-500" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Canlı Teste Katıl</h1>
          <p className="text-slate-500 mt-2">Eğiticinizden aldığınız kodu girin</p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
          {/* Misafir (login'siz) katılım → ad zorunlu. Kayıtlı kullanıcıda gösterilmez. */}
          {!user && (
            <Input
              value={guestName}
              onChange={(e) => setGuestName(e.target.value.slice(0, 60))}
              placeholder="Adınız"
              aria-label="Adınız"
              className="h-12 text-base"
            />
          )}
          <Input
            value={codeInput}
            onChange={(e) => setCodeInput(e.target.value.toUpperCase().slice(0, 6))}
            placeholder="ABCD12"
            className="text-center text-3xl font-black tracking-[0.3em] h-16 uppercase"
            onKeyDown={(e) =>
              e.key === "Enter" &&
              codeInput.length >= 4 &&
              (user || guestName.trim().length >= 2) &&
              joinMutation.mutate()
            }
          />
          <Button
            className="w-full bg-indigo-600 hover:bg-indigo-700 h-12 text-base gap-2"
            onClick={() => joinMutation.mutate()}
            disabled={codeInput.length < 4 || (!user && guestName.trim().length < 2) || joinMutation.isPending}
          >
            {joinMutation.isPending
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Katılınıyor...</>
              : "Katıl"}
          </Button>
          {!user && (
            <p className="text-center text-xs text-slate-400">
              Hesabınız varsa{" "}
              <Link to={createPageUrl("Login")} className="text-indigo-600 hover:underline">
                giriş yapın
              </Link>
            </p>
          )}
        </div>
      </div>
    );
  }

  // ── Loading ── (sessionId set → oturuma giriyoruz; bekleme/test gibi tam ekran)
  if (stateLoading || !state) {
    return (
      <FullscreenStage>
        <div className="flex justify-center pt-20">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
        </div>
      </FullscreenStage>
    );
  }

  // ── Bekleme odası: test henüz başlatılmadı (DRAFT) ──
  // Aday koda girip katıldı ama eğitici testi henüz başlatmadı. Burada bekler;
  // state polling (2s) status ACTIVE olduğunda otomatik olarak test ekranına geçer.
  if (state.status === "DRAFT") {
    return (
      <FullscreenStage>
      <div className="max-w-sm mx-auto pt-16 text-center">
        <div className="bg-white rounded-2xl border border-slate-200 p-8">
          <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse">
            <Zap className="w-8 h-8 text-amber-500" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-1">{state.title}</h2>
          {/* Net uyarı: test henüz başlatılmadı */}
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-sm font-medium mb-3">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Test henüz başlatılmadı
          </div>
          <p className="text-slate-500 text-sm mb-4">
            Bekleme odasındasınız. Eğitici testi başlattığında otomatik olarak içeri alınacaksınız — sayfayı kapatmayın.
          </p>
          <div className="flex items-center justify-center gap-2 text-sm text-slate-500">
            <Users className="w-4 h-4" /> {state.participantCount} katılımcı bekliyor
          </div>
          <div className="flex justify-center gap-1 mt-4">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce"
                style={{ animationDelay: `${i * 0.15}s` }}
              />
            ))}
          </div>
        </div>
      </div>
      </FullscreenStage>
    );
  }

  // ── Session ended — results screen ──
  if (state.status === "ENDED") {
    const r = state.myResults;
    const r1 = r?.round1Results ?? null; // only for round 2
    const isRound2 = state.roundNumber === 2;
    const pct = r ? Math.round((r.correct / r.total) * 100) : null;
    const pct1 = r1 ? Math.round((r1.correct / r1.total) * 100) : null;
    const improvement = pct != null && pct1 != null ? pct - pct1 : null;
    const scoreColor = pct == null ? "text-slate-500"
      : pct >= 80 ? "text-emerald-600"
      : pct >= 50 ? "text-amber-600"
      : "text-rose-600";
    const scoreBg = pct == null ? "bg-slate-50"
      : pct >= 80 ? "bg-emerald-50 border-emerald-200"
      : pct >= 50 ? "bg-amber-50 border-amber-200"
      : "bg-rose-50 border-rose-200";

    return (
      <div className="max-w-lg mx-auto pb-12 pt-6">
        {/* Score card */}
        <div className={`rounded-2xl border-2 p-8 text-center mb-6 ${scoreBg}`}>
          <CheckCircle2 className={`w-14 h-14 mx-auto mb-3 ${scoreColor}`} />
          <h2 className="text-2xl font-bold text-slate-900 mb-1">Test Tamamlandı!</h2>
          <p className="text-slate-500 text-sm mb-5">{state.title}</p>

          {r ? (
            <>
              {/* Round comparison header for round 2 */}
              {isRound2 && pct1 != null && improvement != null && (
                <div className="flex items-center justify-center gap-6 mb-4">
                  <div className="text-center">
                    <p className="text-xs text-slate-500 mb-0.5">Ön-Test</p>
                    <p className="text-2xl font-black text-blue-600">%{pct1}</p>
                  </div>
                  <div className="text-center">
                    {improvement > 0
                      ? <TrendingUp className="w-8 h-8 text-emerald-500 mx-auto" />
                      : improvement < 0
                      ? <TrendingDown className="w-8 h-8 text-rose-500 mx-auto" />
                      : <Minus className="w-8 h-8 text-slate-400 mx-auto" />}
                    <p className={`text-sm font-bold ${improvement > 0 ? "text-emerald-600" : improvement < 0 ? "text-rose-600" : "text-slate-400"}`}>
                      {improvement > 0 ? `+${improvement}%` : `${improvement}%`}
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-slate-500 mb-0.5">Son-Test</p>
                    <p className={`text-2xl font-black ${scoreColor}`}>%{pct}</p>
                  </div>
                </div>
              )}

              <div className={`text-6xl font-black mb-1 ${scoreColor}`}>
                {r.correct}<span className="text-3xl text-slate-400">/{r.total}</span>
              </div>
              <p className={`text-lg font-semibold mb-4 ${scoreColor}`}>%{pct} başarı</p>
              {/* Progress bar */}
              <div className="h-3 bg-white/60 rounded-full overflow-hidden mx-auto max-w-xs">
                <div
                  className={`h-full rounded-full transition-all duration-1000 ${
                    pct >= 80 ? "bg-emerald-500" : pct >= 50 ? "bg-amber-500" : "bg-rose-500"
                  }`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <p className="text-xs text-slate-500 mt-3">
                {state.participantCount} katılımcı • {state.totalQuestions} soru
              </p>
            </>
          ) : (
            <p className="text-slate-500 text-sm">Sonuçlar yükleniyor…</p>
          )}
        </div>

        {/* Per-question breakdown */}
        {r && (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide px-1">Soru Detayları</h3>
            {r.answers.map((a, idx) => {
              const a1 = r1?.answers?.[idx] ?? null;
              return (
              <div
                key={a.questionId}
                className={`bg-white rounded-xl border-2 p-4 ${
                  a.isCorrect ? "border-emerald-200" : a.chosenOptionId ? "border-rose-200" : "border-slate-200"
                }`}
              >
                <div className="flex items-start gap-3">
                  <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5 ${
                    a.isCorrect ? "bg-emerald-100 text-emerald-700"
                    : a.chosenOptionId ? "bg-rose-100 text-rose-700"
                    : "bg-slate-100 text-slate-500"
                  }`}>
                    {idx + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 mb-2">{a.questionContent}</p>

                    {/* Candidate's answer */}
                    {a.chosenOptionId ? (
                      <div className={`flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg mb-1.5 ${
                        a.isCorrect ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
                      }`}>
                        {a.isCorrect
                          ? <CheckCircle2 className="w-4 h-4 shrink-0" />
                          : <span className="w-4 h-4 shrink-0 flex items-center justify-center font-bold text-rose-500">✗</span>
                        }
                        <span>Cevabınız: <strong>{a.chosenOptionContent}</strong></span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg mb-1.5 bg-slate-50 text-slate-500">
                        <span className="w-4 h-4 shrink-0 text-slate-400">–</span>
                        <span>Cevaplanmadı</span>
                      </div>
                    )}

                    {/* Correct answer (if wrong or skipped) */}
                    {!a.isCorrect && (
                      <div className="flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700">
                        <CheckCircle2 className="w-4 h-4 shrink-0" />
                        <span>Doğru cevap: <strong>{a.correctOptionContent}</strong></span>
                      </div>
                    )}

                    {/* Round 1 answer comparison (only in round 2) */}
                    {isRound2 && a1 && (
                      <div className={`flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg mt-1 ${
                        a1.isCorrect ? "bg-blue-50 text-blue-600" : "bg-slate-50 text-slate-400"
                      }`}>
                        <span className="shrink-0">Ön-test:</span>
                        <span>{a1.chosenOptionContent ?? "Cevaplanmadı"}</span>
                        {a1.isCorrect && <CheckCircle2 className="w-3 h-3 shrink-0" />}
                      </div>
                    )}
                  </div>
                </div>
              </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ── Active: show current question ──
  const q = state.currentQuestion;
  const myOptId = submittedOptionId ?? state.myAnswer;
  const answered = !!myOptId;
  const statsData = state.showStats ? state.stats?.[q?.id] : null;

  return (
    <FullscreenStage>
    <div className="max-w-lg mx-auto pb-10">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <p className="text-sm font-semibold text-slate-700">{state.title}</p>
          <p className="text-xs text-slate-400">
            Soru {state.currentQuestionIdx + 1} / {state.totalQuestions}
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Users className="w-3.5 h-3.5" /> {state.participantCount}
        </div>
      </div>
      <Progress
        value={((state.currentQuestionIdx + 1) / state.totalQuestions) * 100}
        className="h-1.5 mb-5"
      />

      {/* Question */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-4">
        {q?.mediaUrl && (
          <div className="mb-4 rounded-xl overflow-hidden border border-slate-100 max-h-52">
            <img src={q.mediaUrl} alt="soru" className="w-full h-full object-cover" />
          </div>
        )}
        <p className="text-lg font-semibold text-slate-900 leading-snug">{q?.content}</p>
      </div>

      {/* Options */}
      <div className="space-y-3">
        {q?.options.map((opt, idx) => {
          const isSelected = myOptId === opt.id;
          const showCorrect = state.status === "ENDED" && opt.isCorrect;

          return (
            <button
              key={opt.id}
              onClick={() => handleAnswer(opt.id)}
              disabled={answerMutation.isPending}
              className={cn(
                "w-full flex items-center gap-4 p-4 rounded-xl border-2 text-left transition-all",
                showCorrect
                  ? "border-emerald-500 bg-emerald-50"
                  : isSelected
                  ? OPTION_SELECTED[idx % OPTION_SELECTED.length]
                  : OPTION_COLORS[idx % OPTION_COLORS.length],
                answered && !isSelected && !showCorrect && "opacity-60",
              )}
            >
              <span className={`w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold text-white shrink-0 ${LETTER_BG[idx % LETTER_BG.length]}`}>
                {LETTERS[idx]}
              </span>
              <div className="flex-1 flex items-center gap-3 min-w-0">
                {opt.mediaUrl && (
                  // Aday tarafı — TakeTest'teki TestPreviewModal ile aynı max-h-32.
                  // Hover'da sağ alta büyüteç çıkar; tıklayınca lightbox açılır.
                  // Span olarak render edilmeli (button içinde nested button kuralı).
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => { e.stopPropagation(); setLightboxUrl(opt.mediaUrl); }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        e.stopPropagation();
                        setLightboxUrl(opt.mediaUrl);
                      }
                    }}
                    className="relative group flex-shrink-0 cursor-zoom-in focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white rounded-lg"
                    aria-label="Görseli büyüt"
                  >
                    <img
                      src={opt.mediaUrl}
                      alt=""
                      className="max-h-32 w-auto max-w-xs object-contain rounded-lg border border-white/40 bg-white"
                    />
                    <span className="absolute bottom-1 right-1 p-1 rounded-full bg-slate-900/70 text-white opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                      <ZoomIn className="w-4 h-4" />
                    </span>
                  </span>
                )}
                {opt.content && (
                  <span className={cn("font-medium", isSelected ? "text-white" : "text-slate-800")}>
                    {opt.content}
                  </span>
                )}
              </div>
              {isSelected && !showCorrect && <CheckCircle2 className="w-5 h-5 shrink-0 text-white" />}
              {showCorrect && <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-600" />}
            </button>
          );
        })}
      </div>

      {/* Feedback */}
      {answered && (
        <div className="mt-4 bg-indigo-50 border border-indigo-200 rounded-xl p-3 text-center">
          <p className="text-sm font-medium text-indigo-800">
            ✓ Cevabınız kaydedildi. Eğiticinin bir sonraki soruya geçmesini bekleyin.
          </p>
        </div>
      )}

      {/* Stats (if educator revealed them) */}
      {statsData && (
        <div className="mt-4 bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-3">Sınıf Sonuçları</p>
          <div className="space-y-2">
            {statsData.map((s, idx) => {
              const total = statsData.reduce((acc, x) => acc + x.count, 0);
              const pct = total > 0 ? Math.round((s.count / total) * 100) : 0;
              return (
                <div key={s.optionId} className="flex items-center gap-2">
                  <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold text-white shrink-0 ${LETTER_BG[idx % LETTER_BG.length]}`}>
                    {LETTERS[idx]}
                  </span>
                  <div className="flex-1">
                    <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${s.isCorrect ? "bg-emerald-500" : LETTER_BG[idx % LETTER_BG.length]}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                  <span className="text-xs text-slate-600 w-10 text-right">{pct}%</span>
                  {s.isCorrect && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Görsel büyüteç (lightbox) ── */}
      <Dialog open={!!lightboxUrl} onOpenChange={(open) => { if (!open) setLightboxUrl(null); }}>
        <DialogContent className="max-w-5xl p-2 bg-transparent border-0 shadow-none">
          <DialogTitle className="sr-only">Görsel</DialogTitle>
          {lightboxUrl && (
            <div className="relative">
              <img
                src={lightboxUrl}
                alt=""
                className="w-full h-auto max-h-[85vh] object-contain rounded-xl bg-white"
              />
              <button
                type="button"
                onClick={() => setLightboxUrl(null)}
                className="absolute top-2 right-2 p-2 rounded-full bg-slate-900/70 text-white hover:bg-slate-900/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
                aria-label="Kapat"
              >
                <XIcon className="w-5 h-5" />
              </button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
    </FullscreenStage>
  );
}
