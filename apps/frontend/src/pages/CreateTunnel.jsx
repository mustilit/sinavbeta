import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import api from "@/lib/api/apiClient";
import { Plus, Trash2, Save, Send, Loader2, ArrowLeft, ArrowRight, Layers, ImagePlus, X, Pencil, CheckCircle2, Upload, History } from "lucide-react";
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
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { entities, topics as topicsApi, tunnels as tunnelApi } from "@/api/dalClient";
import { useAuth } from "@/lib/AuthContext";
import { useAutoSave } from "@/lib/useAutoSave";
import { useServiceStatus } from "@/lib/useServiceStatus";
import { parseDocxToQuestions, parsePdfToQuestions } from "@/lib/importQuestions";
import { createPageUrl } from "@/utils";
import { EXAM_LANGUAGES, examLanguageName } from "@/lib/examLanguages";

/** Zorunlu alan yıldızı. */
function Req() {
  return <span className="text-rose-500"> *</span>;
}

/** Bir soru "tam" mı: içerik/görsel var + tüm şıklar dolu + doğru şık işaretli. */
function isTunnelQuestionComplete(q, optionCount) {
  const qImg = q?._imgPreview || q?.mediaUrl;
  const hasContent = !!((q?.content || "").trim() || qImg);
  const filledOpts = (q?.options ?? []).filter((o) => (o.content || "").trim() || o._imgPreview || o.mediaUrl).length;
  const hasCorrect = (q?.options ?? []).some((o) => o.isCorrect);
  return hasContent && filledOpts === optionCount && hasCorrect;
}

/** Bir katman "tam" mı: asgari soru sayısı dolu + tüm sorular eksiksiz. */
function isTunnelLayerComplete(layer, optionCount, minQuestions) {
  const qs = layer?.questions ?? [];
  return qs.length >= minQuestions && qs.every((q) => isTunnelQuestionComplete(q, optionCount));
}

/** Taslak için katmanları serileştir — File/blob önizleme alanları ATILIR
 *  (localStorage'a yazılamaz; normal testteki gibi yalnız yüklenmiş URL saklanır). */
function stripLayersForDraft(ls) {
  return (ls ?? []).map((l) => ({
    index: l.index,
    questions: (l.questions ?? []).map((q) => ({
      content: q.content || "",
      mediaUrl: q.mediaUrl || "",
      options: (q.options ?? []).map((o) => ({
        content: o.content || "",
        isCorrect: !!o.isCorrect,
        mediaUrl: o.mediaUrl || "",
      })),
    })),
  }));
}

/** Kararlı (deterministik) taslak görüntüsü — baseline ve karşılaştırma için. */
function buildTunnelSnapshot(m) {
  return {
    v: 1,
    title: m.title || "",
    description: m.description || "",
    examTypeId: m.examTypeId || "",
    topicId: m.topicId || "",
    priceTL: m.priceTL || "",
    language: m.language || "tr",
    coverImageUrl: m.coverImageUrl || "",
    layers: stripLayersForDraft(m.layers),
  };
}

const LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"];

/** Boş soru — opsiyon sayısı tünelin optionsPerQuestion'ı kadar. */
function emptyQuestion(optionCount) {
  return {
    content: "",
    mediaUrl: "",
    _imgFile: null,
    _imgPreview: "",
    options: Array.from({ length: optionCount }, () => ({
      content: "",
      isCorrect: false,
      mediaUrl: "",
      _imgFile: null,
      _imgPreview: "",
    })),
  };
}

/**
 * Tünel oluşturma sihirbazı (eğitici).
 *  - Adım 1: sınav türü + konu + başlık (+ fiyat + kapak görseli) → tünel (DRAFT).
 *    Var olan tünelde Adım 2'den Adım 1'e dönülüp meta güncellenebilir (PATCH).
 *  - Adım 2: her katman için sorular (görselli soru + görselli şık) + "Onaya gönder".
 * Görsel ekleme normal test bileşeniyle aynı: dosya seç → blob önizleme → kaydetmede yükle.
 */
export default function CreateTunnel() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const tunnelId = params.get("id");
  const [step, setStep] = useState(tunnelId ? 2 : 1);

  // Adım 1 form
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [examTypeId, setExamTypeId] = useState("");
  const [gradeLevelId, setGradeLevelId] = useState("");
  const [topicId, setTopicId] = useState("");
  const [priceTL, setPriceTL] = useState("");
  const [language, setLanguage] = useState("tr");
  const [coverImageUrl, setCoverImageUrl] = useState("");
  const metaLoaded = useRef(false);

  // Adım 2 — katman bazlı sorular
  const [layers, setLayers] = useState([]); // [{ index, questions:[...] }]
  const [activeLayer, setActiveLayer] = useState(1);

  const { minTunnelPriceCents = 0, minQuestionsPerLayer = 10 } = useServiceStatus();
  const minPriceTL = minTunnelPriceCents / 100;
  const priceCents = Math.round((parseFloat(priceTL) || 0) * 100);
  const priceTooLow = priceCents < minTunnelPriceCents;

  const { data: examTypes = [] } = useQuery({
    queryKey: ["examTypes"],
    queryFn: () => entities.ExamType.filter({ is_active: true }),
  });
  const { data: gradeLevels = [] } = useQuery({
    queryKey: ["gradeLevels", "active"],
    queryFn: () => entities.GradeLevel.filter({ is_active: true }),
  });
  const { data: topicList = [] } = useQuery({
    queryKey: ["topicsFlat", examTypeId],
    queryFn: () => topicsApi.flat(examTypeId || undefined).catch(() => []),
  });

  // Var olan tüneli yükle (adım 2 / düzenleme)
  const { data: tunnel } = useQuery({
    queryKey: ["tunnel", tunnelId],
    queryFn: () => tunnelApi.get(tunnelId),
    enabled: !!tunnelId,
  });

  const optionCount = tunnel?.optionsPerQuestion ?? 10;
  const layerCount = tunnel?.layerCount ?? 7;
  const readOnly = tunnel && !["DRAFT", "REJECTED"].includes(tunnel.status);

  // ─── Taslak koruma (otomatik kaydetme) — normal test ekranıyla aynı ────────
  // Elektrik kesilmesi / sekme kapanması / yenileme durumunda yazılan sorular
  // kaybolmaz: localStorage (senkron) + sunucu DraftSnapshot (debounce) yedeği.
  const { user } = useAuth();
  const draftKey = user?.id ? `createTunnel_${user.id}_${tunnelId || "new"}` : null;
  const serverKey = user?.id ? `createTunnel_${tunnelId || "new"}` : null;
  const baselineRef = useRef(null);   // server'dan yüklenen halin canonical JSON'u
  const restoredRef = useRef(false);  // restore kontrolü bir kez çalışsın
  const [showDraftDialog, setShowDraftDialog] = useState(false);
  const [draftInfo, setDraftInfo] = useState(null);

  const getFormData = useCallback(
    () => buildTunnelSnapshot({ title, description, examTypeId, gradeLevelId, topicId, priceTL, language, coverImageUrl, layers }),
    [title, description, examTypeId, gradeLevelId, topicId, priceTL, language, coverImageUrl, layers],
  );

  const { scheduleSave, loadDraft, clearDraft, lastSavedAt } = useAutoSave(
    draftKey ?? "__noop__",
    getFormData,
    { enabled: !!draftKey, serverKey },
  );

  // Form değiştikçe debounce'lu kaydet
  useEffect(() => {
    if (draftKey) scheduleSave();
  }, [getFormData, draftKey, scheduleSave]);

  // Mevcut tünel için server baseline'ı kur (taslak gerçekten daha yeni mi karşılaştırması)
  useEffect(() => {
    if (!tunnel) return;
    baselineRef.current = JSON.stringify(
      buildTunnelSnapshot({
        title: tunnel.title,
        description: tunnel.description,
        examTypeId: tunnel.examType?.id,
        topicId: tunnel.topic?.id,
        priceTL: tunnel.priceCents ? String(tunnel.priceCents / 100) : "",
        coverImageUrl: tunnel.coverImageUrl,
        layers: (tunnel.layers ?? []).map((l) => ({ index: l.index, questions: l.questions ?? [] })),
      }),
    );
  }, [tunnel]);

  // Açılışta taslak kontrolü — server ile aynı değilse "geri yükle?" sor
  useEffect(() => {
    if (!draftKey || restoredRef.current) return;
    if (tunnelId && !tunnel) return; // mevcut tünelde server yüklensin
    let cancelled = false;
    (async () => {
      const draft = await loadDraft();
      if (cancelled) return;
      restoredRef.current = true;
      const d = draft?.data;
      if (!d) return;
      const hasWork = (d.layers ?? []).some((l) => (l.questions ?? []).length > 0) || (d.title ?? "").trim();
      if (!hasWork) return;
      const draftCanon = JSON.stringify(buildTunnelSnapshot(d));
      if (baselineRef.current && draftCanon === baselineRef.current) return; // server ile birebir aynı
      setDraftInfo(draft);
      setShowDraftDialog(true);
    })();
    return () => { cancelled = true; };
  }, [draftKey, tunnelId, tunnel, loadDraft]);

  const applyDraft = () => {
    const d = draftInfo?.data;
    if (!d) { setShowDraftDialog(false); return; }
    setTitle(d.title || "");
    setDescription(d.description || "");
    setExamTypeId(d.examTypeId || "");
    setGradeLevelId(d.gradeLevelId || "");
    setTopicId(d.topicId || "");
    setPriceTL(d.priceTL || "");
    setLanguage(d.language || "tr");
    setCoverImageUrl(d.coverImageUrl || "");
    setLayers((d.layers ?? []).map((l) => ({
      index: l.index,
      questions: (l.questions ?? []).map((q) => ({
        content: q.content || "",
        mediaUrl: q.mediaUrl || "",
        _imgFile: null,
        _imgPreview: "",
        options: (q.options ?? []).map((o) => ({
          content: o.content || "",
          isCorrect: !!o.isCorrect,
          mediaUrl: o.mediaUrl || "",
          _imgFile: null,
          _imgPreview: "",
        })),
      })),
    })));
    metaLoaded.current = true;
    setShowDraftDialog(false);
    toast.success("Taslak geri yüklendi");
  };
  const discardDraft = () => { clearDraft(); setShowDraftDialog(false); };

  const draftSavedAtLabel = draftInfo?.savedAt
    ? new Date(draftInfo.savedAt).toLocaleString("tr-TR")
    : "";

  const draftDialog = (
    <Dialog open={showDraftDialog} onOpenChange={setShowDraftDialog}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5 text-indigo-600" /> Kaydedilmemiş taslak bulundu
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Bu tünel için kaydedilmemiş değişiklikler var. Kaldığın yerden devam etmek ister misin?
            {draftSavedAtLabel && <span className="text-slate-400"> ({draftSavedAtLabel})</span>}
          </p>
          <div className="flex gap-3">
            <Button className="flex-1 bg-indigo-600 text-white hover:bg-indigo-700" onClick={applyDraft}>Devam et</Button>
            <Button variant="outline" className="flex-1" onClick={discardDraft}>Taslağı sil</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );

  // Tünel gelince katman + adım1 meta state'ini kur (yalnız ilk yükleme)
  useEffect(() => {
    if (!tunnel) return;
    const byIndex = new Map((tunnel.layers ?? []).map((l) => [l.index, l.questions ?? []]));
    const next = Array.from({ length: tunnel.layerCount }, (_, i) => {
      const idx = i + 1;
      const qs = (byIndex.get(idx) ?? []).map((q) => ({
        content: q.content,
        mediaUrl: q.mediaUrl ?? "",
        _imgFile: null,
        _imgPreview: "",
        options: q.options.map((o) => ({
          content: o.content,
          isCorrect: o.isCorrect,
          mediaUrl: o.mediaUrl ?? "",
          _imgFile: null,
          _imgPreview: "",
        })),
      }));
      return { index: idx, questions: qs };
    });
    setLayers(next);
    if (!metaLoaded.current) {
      setTitle(tunnel.title ?? "");
      setDescription(tunnel.description ?? "");
      setExamTypeId(tunnel.examType?.id ?? "");
      setGradeLevelId(tunnel.gradeLevel?.id ?? "");
      setTopicId(tunnel.topic?.id ?? "");
      setPriceTL(tunnel.priceCents ? String(tunnel.priceCents / 100) : "");
      setLanguage(tunnel.language ?? "tr");
      setCoverImageUrl(tunnel.coverImageUrl ?? "");
      metaLoaded.current = true;
    }
  }, [tunnel]);

  const createMut = useMutation({
    mutationFn: () =>
      tunnelApi.create({
        title: title.trim(),
        description: description.trim() || undefined,
        examTypeId,
        gradeLevelId: gradeLevelId || undefined,
        topicId,
        priceCents: Math.round((parseFloat(priceTL) || 0) * 100),
        language,
        coverImageUrl: coverImageUrl || undefined,
      }),
    onSuccess: (t) => {
      toast.success("Tünel oluşturuldu");
      clearDraft(); // "new" taslağını temizle (artık server'da kayıtlı)
      metaLoaded.current = true;
      setParams({ id: t.id });
      setStep(2);
    },
    onError: (e) => toast.error(e?.message || "Tünel oluşturulamadı"),
  });

  const updateMut = useMutation({
    mutationFn: () =>
      tunnelApi.update(tunnelId, {
        title: title.trim(),
        description: description.trim() || "",
        examTypeId,
        gradeLevelId: gradeLevelId || undefined,
        topicId,
        priceCents: Math.round((parseFloat(priceTL) || 0) * 100),
        language,
        coverImageUrl: coverImageUrl || "",
      }),
    onSuccess: () => {
      toast.success("Tünel bilgileri güncellendi");
      setStep(2);
    },
    onError: (e) => toast.error(e?.message || "Güncellenemedi"),
  });

  // Bekleyen görselleri yükle → temiz layers payload (API + local senkron)
  const prepareLayers = async () => {
    const out = [];
    for (const l of layers) {
      const qs = [];
      for (const q of l.questions ?? []) {
        let mediaUrl = q.mediaUrl || "";
        if (q._imgFile) mediaUrl = await tunnelApi.uploadImage(q._imgFile);
        const opts = [];
        for (const o of q.options ?? []) {
          let om = o.mediaUrl || "";
          if (o._imgFile) om = await tunnelApi.uploadImage(o._imgFile);
          opts.push({ content: o.content, isCorrect: o.isCorrect, mediaUrl: om });
        }
        qs.push({ content: q.content, mediaUrl, options: opts });
      }
      out.push({ index: l.index, questions: qs });
    }
    return out;
  };

  // Temiz payload'ı editör state'ine geri yaz (blob'ları bırak, tekrar upload önle)
  const syncCleanToState = (clean) =>
    setLayers(
      clean.map((l) => ({
        index: l.index,
        questions: l.questions.map((q) => ({
          content: q.content,
          mediaUrl: q.mediaUrl || "",
          _imgFile: null,
          _imgPreview: "",
          options: q.options.map((o) => ({
            content: o.content,
            isCorrect: o.isCorrect,
            mediaUrl: o.mediaUrl || "",
            _imgFile: null,
            _imgPreview: "",
          })),
        })),
      })),
    );

  const saveMut = useMutation({
    mutationFn: async () => {
      const clean = await prepareLayers();
      await tunnelApi.saveQuestions(tunnelId, clean);
      return clean;
    },
    onSuccess: (clean) => {
      syncCleanToState(clean);
      toast.success("Taslak kaydedildi");
      navigate(createPageUrl("ManageTunnels"));
    },
    onError: (e) => toast.error(e?.message || "Kaydedilemedi"),
  });

  const submitMut = useMutation({
    mutationFn: async () => {
      const clean = await prepareLayers();
      await tunnelApi.saveQuestions(tunnelId, clean);
      return tunnelApi.submit(tunnelId);
    },
    onSuccess: () => {
      toast.success("Tünel onaya gönderildi");
      clearDraft(); // onaya gönderildi → taslak gereksiz
      navigate(createPageUrl("ManageTunnels"));
    },
    onError: (e) => toast.error(e?.message || "Onaya gönderilemedi"),
  });

  const updateLayer = (index, questions) =>
    setLayers((prev) => prev.map((l) => (l.index === index ? { ...l, questions } : l)));

  const current = useMemo(() => layers.find((l) => l.index === activeLayer), [layers, activeLayer]);

  // ─── Adım 1 ───
  if (step === 1) {
    const canSubmit = title.trim() && examTypeId && topicId && !priceTooLow;
    const editing = !!tunnelId;
    return (
      <div className="mx-auto max-w-2xl px-4 py-6">
        <h1 className="mb-1 text-2xl font-bold text-slate-900">{editing ? "Tünel Bilgileri" : "Tünel Oluştur"}</h1>
        <p className="mb-6 text-sm text-slate-500">Adım 1/2 — Sınav türü, konu, başlık ve kapak</p>
        <Card>
          <CardContent className="space-y-4 p-5">
            {/* Kapak görseli */}
            <TunnelCoverUpload value={coverImageUrl} onChange={setCoverImageUrl} titlePreview={title} />

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Başlık<Req /></label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Tünel başlığı" maxLength={200} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Açıklama (opsiyonel)</label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} maxLength={2000} />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Sınav Türü<Req /></label>
                <Select value={examTypeId} onValueChange={(v) => { setExamTypeId(v); setTopicId(""); }}>
                  <SelectTrigger><SelectValue placeholder="Seçin" /></SelectTrigger>
                  <SelectContent>
                    {examTypes.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Sınıf</label>
                <Select value={gradeLevelId || "none"} onValueChange={(v) => setGradeLevelId(v === "none" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="Genel" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Genel</SelectItem>
                    {gradeLevels.map((g) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Konu<Req /></label>
                <Select value={topicId} onValueChange={setTopicId} disabled={!examTypeId}>
                  <SelectTrigger><SelectValue placeholder="Seçin" /></SelectTrigger>
                  <SelectContent>
                    {topicList.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                {examTypeId && topicList.length === 0 && (
                  <p className="mt-1 text-xs text-amber-600">Bu sınav türünde tanımlı konu yok; tünel için konu zorunlu.</p>
                )}
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Fiyat (₺)</label>
              <Input type="number" min="0" step="1" value={priceTL} onChange={(e) => setPriceTL(e.target.value)} placeholder="0" className="max-w-[140px]" />
              {minTunnelPriceCents > 0 ? (
                <p className={"mt-1 text-xs " + (priceTooLow ? "text-rose-600" : "text-slate-400")}>
                  Minimum tünel fiyatı: ₺{minPriceTL.toFixed(2)}
                </p>
              ) : (
                <p className="mt-1 text-xs text-slate-400">0 = ücretsiz</p>
              )}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Sınav Dili</label>
              <Select value={language} onValueChange={setLanguage}>
                <SelectTrigger className="max-w-[200px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {EXAM_LANGUAGES.map((code) => <SelectItem key={code} value={code}>{examLanguageName(code)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-between pt-2">
              {editing ? (
                <Button variant="ghost" onClick={() => setStep(2)}>
                  <ArrowLeft className="mr-2 h-4 w-4" /> Sorulara dön
                </Button>
              ) : <span />}
              {editing ? (
                <Button className="bg-indigo-600 text-white hover:bg-indigo-700" onClick={() => updateMut.mutate()} disabled={!canSubmit || updateMut.isPending}>
                  {updateMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Kaydet ve devam
                </Button>
              ) : (
                <Button className="bg-indigo-600 text-white hover:bg-indigo-700" onClick={() => createMut.mutate()} disabled={!canSubmit || createMut.isPending}>
                  {createMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowRight className="mr-2 h-4 w-4" />}
                  Devam (sorular)
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
        {draftDialog}
      </div>
    );
  }

  // ─── Adım 2 ───
  // Sol dikey katman listesi — hem düzenleme hem salt-görüntüleme modunda kullanılır.
  const layerNav = (
    <nav className="flex flex-row flex-wrap gap-1.5 sm:w-44 sm:flex-shrink-0 sm:flex-col" aria-label="Katmanlar">
      {Array.from({ length: layerCount }, (_, i) => i + 1).map((idx) => {
        const layerObj = layers.find((l) => l.index === idx);
        const cnt = layerObj?.questions.length ?? 0;
        const complete = isTunnelLayerComplete(layerObj, optionCount, minQuestionsPerLayer);
        return (
          <button
            key={idx}
            onClick={() => setActiveLayer(idx)}
            title={complete ? "Katman tamamlandı" : `En az ${minQuestionsPerLayer} eksiksiz soru gerekli`}
            className={
              "inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium sm:w-full " +
              (activeLayer === idx ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200")
            }
          >
            {complete
              ? <CheckCircle2 className={"h-3.5 w-3.5 flex-shrink-0 " + (activeLayer === idx ? "text-emerald-300" : "text-emerald-600")} />
              : <Layers className="h-3.5 w-3.5 flex-shrink-0" />}
            <span className="sm:flex-1 sm:text-left">Katman {idx}</span>
            <span className={"rounded-full px-1.5 text-xs " + (activeLayer === idx ? "bg-white/20" : "bg-slate-200")}>{cnt}</span>
          </button>
        );
      })}
    </nav>
  );

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      {draftDialog}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{tunnel?.title || "Tünel"}</h1>
          <p className="text-sm text-slate-500">
            Adım 2/2 — Katman katman sorular ({optionCount} seçenek, 1 doğru)
            {tunnel?.status === "REJECTED" && (
              <span className="ml-2 rounded bg-rose-100 px-2 py-0.5 text-xs text-rose-700">
                Reddedildi: {tunnel.reviewNote}
              </span>
            )}
          </p>
        </div>
        <Button variant="ghost" onClick={() => navigate(createPageUrl("ManageTunnels"))}>
          <ArrowLeft className="mr-1.5 h-4 w-4" /> Tünellerim
        </Button>
      </div>

      {readOnly ? (
        <>
          {/* Salt-görüntüleme önizlemesi — yayınlanmış/onaydaki tünel düzenlenemez. */}
          <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
            {tunnel.status === "PENDING_APPROVAL"
              ? "Bu tünel yönetici onayı bekliyor. Yalnızca görüntüleniyor, düzenlenemez."
              : tunnel.status === "PUBLISHED"
                ? "Bu tünel yayında. Yalnızca görüntüleniyor, düzenlenemez."
                : tunnel.status === "APPROVED"
                  ? "Bu tünel onaylandı. Yalnızca görüntüleniyor, düzenlenemez."
                  : "Bu tünel yalnızca görüntüleniyor, düzenlenemez."}
          </div>
          {tunnel.coverImageUrl && (
            <img src={tunnel.coverImageUrl} alt={tunnel.title} className="mb-4 h-40 w-full rounded-xl object-cover" />
          )}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            {layerNav}
            <div className="min-w-0 flex-1">
              <LayerPreview layer={current} />
            </div>
          </div>
        </>
      ) : (
        <>
          {/* Adım 1'e dön (meta düzenle) */}
          <div className="mb-3">
            <Button variant="outline" size="sm" onClick={() => setStep(1)}>
              <Pencil className="mr-1.5 h-4 w-4" /> Bilgileri düzenle (Adım 1)
            </Button>
          </div>

          {/* İki sütun: solda dikey katman listesi, sağda soru editörü */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            {layerNav}

            {/* Sağ: aktif katman soruları + aksiyonlar */}
            <div className="min-w-0 flex-1">
              <LayerEditor
                key={activeLayer}
                layer={current}
                optionCount={optionCount}
                onChange={(qs) => updateLayer(activeLayer, qs)}
              />

              <div className="mt-6 flex flex-wrap items-center justify-end gap-2">
                <span className="mr-auto inline-flex items-center gap-1 text-xs text-slate-400">
                  <History className="h-3.5 w-3.5" />
                  {lastSavedAt ? `Otomatik kaydedildi · ${lastSavedAt.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}` : "Otomatik kaydetme açık"}
                </span>
                <Button variant="outline" onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
                  {saveMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Taslağı Kaydet
                </Button>
                <Button className="bg-indigo-600 text-white hover:bg-indigo-700" onClick={() => submitMut.mutate()} disabled={submitMut.isPending}>
                  {submitMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                  Onaya Gönder
                </Button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/** Salt-görüntüleme katman önizlemesi (yayınlanmış/onaydaki tünel için). */
function LayerPreview({ layer }) {
  const questions = layer?.questions ?? [];
  if (questions.length === 0) {
    return <p className="py-6 text-center text-sm text-slate-400">Bu katmanda soru yok.</p>;
  }
  return (
    <div className="space-y-3">
      {questions.map((q, qi) => (
        <div key={qi} className="rounded-lg border border-slate-200 p-4">
          <div className="whitespace-pre-wrap text-sm font-medium text-slate-800">{qi + 1}. {q.content}</div>
          {q.mediaUrl && <img src={q.mediaUrl} alt="" className="mt-2 max-h-48 rounded-md object-contain" />}
          <ul className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-2">
            {q.options.map((o, oi) => (
              <li key={oi} className={"flex items-center gap-1.5 text-sm " + (o.isCorrect ? "font-semibold text-emerald-700" : "text-slate-600")}>
                <span className="w-4 flex-shrink-0 text-xs font-semibold text-slate-400">{LETTERS[oi]}</span>
                {o.isCorrect
                  ? <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-emerald-600" />
                  : <span className="h-4 w-4 flex-shrink-0" />}
                {o.mediaUrl && <img src={o.mediaUrl} alt="" className="h-8 w-8 flex-shrink-0 rounded object-cover" />}
                {o.content && <span>{o.content}</span>}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/** Tünel kapak görseli yükleyici — paket kartı/hero görünümünü taklit eder. */
function TunnelCoverUpload({ value, onChange, titlePreview }) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!["image/jpeg", "image/jpg", "image/png", "image/webp"].includes(file.type)) {
      toast.error("Geçersiz format (PNG/JPG/WebP)");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Görsel 5MB'tan büyük olamaz");
      return;
    }
    setUploading(true);
    try {
      const url = await tunnelApi.uploadImage(file);
      if (!url) throw new Error("no url");
      onChange(url);
      toast.success("Kapak yüklendi");
    } catch {
      toast.error("Yükleme başarısız");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-slate-700">Kapak görseli (opsiyonel)</label>
      <div className="relative h-40 overflow-hidden rounded-2xl" style={{ backgroundColor: value ? "transparent" : "#0000CD" }}>
        {value ? (
          <img src={value} alt={titlePreview || "kapak"} className="h-full w-full object-cover" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <Layers className="h-16 w-16 text-white/30" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
        <div className="absolute left-3 top-3">
          <span className="rounded-full bg-white/90 px-2.5 py-1 text-xs font-semibold text-indigo-700">Tünel</span>
        </div>
        {titlePreview && (
          <h3 className="absolute bottom-3 left-3 right-3 truncate text-lg font-bold text-white">{titlePreview}</h3>
        )}
      </div>
      <div className="flex items-center gap-2">
        <input ref={inputRef} type="file" accept="image/jpeg,image/jpg,image/png,image/webp" onChange={handleUpload} className="hidden" />
        <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()} disabled={uploading}>
          {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ImagePlus className="mr-2 h-4 w-4" />}
          {value ? "Değiştir" : "Kapak yükle"}
        </Button>
        {value && (
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange("")}>
            <X className="mr-1 h-4 w-4" /> Kaldır
          </Button>
        )}
      </div>
    </div>
  );
}

/** Tek katmanın soru editörü (görselli soru + görselli şık). */
function LayerEditor({ layer, optionCount, onChange }) {
  const questions = layer?.questions ?? [];
  // Akordeon: aynı anda yalnız bir soru açık. null = hepsi kapalı.
  const [openIndex, setOpenIndex] = useState(null);

  const addQuestion = () => {
    const next = [...questions, emptyQuestion(optionCount)];
    onChange(next);
    setOpenIndex(next.length - 1); // yeni soru açılır, diğerleri kapanır
  };
  const removeQuestion = (qi) => {
    onChange(questions.filter((_, i) => i !== qi));
    setOpenIndex((cur) => (cur === qi ? null : cur != null && cur > qi ? cur - 1 : cur));
  };
  const setQ = (qi, patch) => onChange(questions.map((q, i) => (i === qi ? { ...q, ...patch } : q)));
  // Kopya soru kontrolü — yalnız tünel soru havuzu içinde (blur).
  const checkDup = async (qi, text) => {
    const t = (text || "").trim();
    if (t.length < 15 || questions[qi]?._dup) return;
    try {
      const { data } = await api.post("/educators/me/questions/check-duplicate-tunnel", {
        content: t,
        excludeQuestionId: questions[qi]?.id ?? null,
      });
      if (data?.isDuplicate) {
        setQ(qi, { _dup: data });
        toast.warning("Benzer bir tünel sorusu mevcut (aynılık kontrolü).");
      }
    } catch {
      // sessiz
    }
  };
  const setOpt = (qi, oi, patch) =>
    setQ(qi, { options: questions[qi].options.map((o, i) => (i === oi ? { ...o, ...patch } : o)) });
  const setCorrect = (qi, oi) =>
    setQ(qi, { options: questions[qi].options.map((o, i) => ({ ...o, isCorrect: i === oi })) });

  const pickQImg = (qi, file) => {
    if (!file) return;
    setOptOrQImg(qi, null, file, (patch) => setQ(qi, patch));
  };
  const pickOptImg = (qi, oi, file) => {
    if (!file) return;
    setOptOrQImg(qi, oi, file, (patch) => setOpt(qi, oi, patch));
  };
  // Ortak: blob önizleme üret, mediaUrl temizle (yeni dosya yüklenecek)
  const setOptOrQImg = (_qi, _oi, file, apply) => {
    const preview = URL.createObjectURL(file);
    apply({ _imgFile: file, _imgPreview: preview, mediaUrl: "" });
  };

  // DOCX/PDF içe aktarma — normal testle aynı parser (client-side, mammoth/pdfjs).
  const [importing, setImporting] = useState(null); // 'docx' | 'pdf' | null
  const runImport = async (file, type) => {
    if (!file) return;
    setImporting(type);
    try {
      const parsed = type === "pdf"
        ? await parsePdfToQuestions(file, () => emptyQuestion(optionCount))
        : await parseDocxToQuestions(file, () => emptyQuestion(optionCount));
      if (!parsed.length) {
        toast.error("İçe aktarılacak soru bulunamadı");
        return;
      }
      onChange([...questions, ...parsed]);
      setOpenIndex(null);
      toast.success(`${parsed.length} soru içe aktarıldı`);
    } catch (e) {
      toast.error("İçe aktarma hatası: " + (e?.message || "bilinmeyen"));
    } finally {
      setImporting(null);
    }
  };

  return (
    <div className="space-y-3">
      {questions.length === 0 && (
        <p className="py-6 text-center text-sm text-slate-400">Bu katmanda henüz soru yok.</p>
      )}
      {questions.map((q, qi) => {
        const qImg = q._imgPreview || q.mediaUrl;
        const isOpen = openIndex === qi;
        const hasContent = !!((q.content || "").trim() || qImg);
        const filledOpts = q.options.filter((o) => (o.content || "").trim() || o._imgPreview || o.mediaUrl).length;
        const correctIdx = q.options.findIndex((o) => o.isCorrect);
        const isComplete = isTunnelQuestionComplete(q, optionCount);
        return (
          <div key={qi} className={"rounded-lg border " + (isOpen ? "border-indigo-200" : "border-slate-200 hover:bg-slate-50/50")}>
              {/* Başlık satırı — normal test ile aynı düzen */}
              <div className="flex flex-wrap items-center gap-3 px-3 py-2">
                <span className="flex-shrink-0 text-sm font-semibold text-slate-600">Soru {qi + 1}</span>
                {isComplete
                  ? <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-emerald-600" />
                  : <div className="h-4 w-4 flex-shrink-0 rounded-full border-2 border-slate-300" />}
                {hasContent && (
                  <span className="flex-shrink-0 rounded-full text-[10px] font-medium text-slate-500">{qImg ? "Görsel" : "Metin"}</span>
                )}
                <span className="ml-auto flex-shrink-0 text-xs text-slate-500">
                  {filledOpts} Seçenekli{correctIdx >= 0 ? ` • Doğru: ${LETTERS[correctIdx]}` : " • Doğru: —"}
                </span>
                <div className="flex flex-shrink-0 gap-1">
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-slate-600 hover:bg-slate-100" onClick={() => setOpenIndex(isOpen ? null : qi)} aria-label="Düzenle" title="Düzenle">
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-rose-600 hover:bg-rose-50" onClick={() => removeQuestion(qi)} aria-label="Soruyu sil" title="Sil">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Gövde — yalnız açıkken */}
              {isOpen && (
                <div className="space-y-2 border-t border-slate-100 p-4 pt-3">
              <Textarea
                value={q.content}
                onChange={(e) => setQ(qi, { content: e.target.value, _dup: null })}
                onBlur={(e) => checkDup(qi, e.target.value)}
                rows={2}
                placeholder="Soru metni (görsel-only soru için boş bırakılabilir)"
              />
              {q._dup?.isDuplicate && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs">
                  <p className="font-medium text-amber-900">Bu soru mevcut bir tünel sorunuza çok benziyor.</p>
                  <p className="mt-0.5 text-amber-700">Benzerlik: %{Math.round((q._dup.similarity || 0) * 100)}</p>
                </div>
              )}
              {/* Soru görseli */}
              <div className="flex flex-wrap items-center gap-2">
                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
                  <ImagePlus className="h-4 w-4" /> Soru görseli
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; pickQImg(qi, f); }} />
                </label>
                {qImg && (
                  <>
                    <div className="h-12 w-16 flex-shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
                      <img src={qImg} alt="" className="h-full w-full object-cover" />
                    </div>
                    <button type="button" onClick={() => setQ(qi, { _imgFile: null, _imgPreview: "", mediaUrl: "" })} className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-white px-2 py-1.5 text-xs text-rose-600 hover:bg-rose-50">
                      <X className="h-3.5 w-3.5" /> Kaldır
                    </button>
                  </>
                )}
              </div>
              {/* Şıklar */}
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {q.options.map((o, oi) => {
                  const oImg = o._imgPreview || o.mediaUrl;
                  return (
                    <div key={oi} className="flex items-center gap-2 rounded-lg border border-slate-200 px-2 py-1.5">
                      <input
                        type="radio"
                        name={`correct-${layer.index}-${qi}`}
                        checked={o.isCorrect}
                        onChange={() => setCorrect(qi, oi)}
                        aria-label={`${LETTERS[oi]} doğru`}
                      />
                      <span className="w-4 text-xs font-semibold text-slate-500">{LETTERS[oi]}</span>
                      <input
                        className="flex-1 bg-transparent text-sm outline-none"
                        value={o.content}
                        onChange={(e) => setOpt(qi, oi, { content: e.target.value })}
                        placeholder={`${LETTERS[oi]} şıkkı`}
                      />
                      {oImg && (
                        <div className="h-8 w-8 flex-shrink-0 overflow-hidden rounded border border-slate-200 bg-slate-100">
                          <img src={oImg} alt="" className="h-full w-full object-cover" />
                        </div>
                      )}
                      <label className="inline-flex cursor-pointer items-center rounded border border-slate-200 bg-white p-1.5 text-slate-500 hover:bg-slate-50" aria-label={`${LETTERS[oi]} şık görseli`}>
                        <ImagePlus className="h-3.5 w-3.5" />
                        <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; pickOptImg(qi, oi, f); }} />
                      </label>
                      {oImg && (
                        <button type="button" onClick={() => setOpt(qi, oi, { _imgFile: null, _imgPreview: "", mediaUrl: "" })} className="text-rose-500" aria-label={`${LETTERS[oi]} görsel kaldır`}>
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
              <p className="text-xs text-slate-400">Doğru şıkkı radyo ile işaretleyin ({optionCount} seçenek). Metin yerine görsel de kullanılabilir.</p>
                </div>
              )}
          </div>
        );
      })}

      {/* + Soru Ekle (kesik kenar) */}
      <Button
        variant="outline"
        onClick={addQuestion}
        className="w-full border-2 border-dashed border-slate-300 text-slate-600 hover:border-indigo-400 hover:bg-indigo-50/50 hover:text-indigo-700"
      >
        <Plus className="mr-1 h-4 w-4" /> Soru Ekle
      </Button>

      {/* DOCX / PDF içe aktarma — normal testle aynı */}
      <div className="flex flex-wrap items-center justify-center gap-6 pt-1">
        <label className={"inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 " + (importing ? "cursor-default opacity-60" : "cursor-pointer")}>
          {importing === "docx" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {importing === "docx" ? "Aktarılıyor…" : "DOCX İçeri Aktar"}
          <input type="file" accept=".docx" className="hidden" disabled={!!importing} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; runImport(f, "docx"); }} />
        </label>
        <label className={"inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 " + (importing ? "cursor-default opacity-60" : "cursor-pointer")}>
          {importing === "pdf" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {importing === "pdf" ? "Aktarılıyor…" : "PDF İçeri Aktar"}
          <input type="file" accept=".pdf" className="hidden" disabled={!!importing} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; runImport(f, "pdf"); }} />
        </label>
      </div>
    </div>
  );
}
