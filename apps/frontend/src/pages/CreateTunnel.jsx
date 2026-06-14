import { useState, useEffect, useMemo, useRef } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2, Save, Send, Loader2, ArrowLeft, ArrowRight, Layers, ImagePlus, X, Pencil } from "lucide-react";
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
import { entities, topics as topicsApi, tunnels as tunnelApi } from "@/api/dalClient";
import { useServiceStatus } from "@/lib/useServiceStatus";
import { createPageUrl } from "@/utils";

/** Zorunlu alan yıldızı. */
function Req() {
  return <span className="text-rose-500"> *</span>;
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
  const [topicId, setTopicId] = useState("");
  const [priceTL, setPriceTL] = useState("");
  const [coverImageUrl, setCoverImageUrl] = useState("");
  const metaLoaded = useRef(false);

  // Adım 2 — katman bazlı sorular
  const [layers, setLayers] = useState([]); // [{ index, questions:[...] }]
  const [activeLayer, setActiveLayer] = useState(1);

  const { minTunnelPriceCents = 0 } = useServiceStatus();
  const minPriceTL = minTunnelPriceCents / 100;
  const priceCents = Math.round((parseFloat(priceTL) || 0) * 100);
  const priceTooLow = priceCents < minTunnelPriceCents;

  const { data: examTypes = [] } = useQuery({
    queryKey: ["examTypes"],
    queryFn: () => entities.ExamType.filter({ is_active: true }),
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
      setTopicId(tunnel.topic?.id ?? "");
      setPriceTL(tunnel.priceCents ? String(tunnel.priceCents / 100) : "");
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
        topicId,
        priceCents: Math.round((parseFloat(priceTL) || 0) * 100),
        coverImageUrl: coverImageUrl || undefined,
      }),
    onSuccess: (t) => {
      toast.success("Tünel oluşturuldu");
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
        topicId,
        priceCents: Math.round((parseFloat(priceTL) || 0) * 100),
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
      toast.success("Sorular kaydedildi");
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
            <div className="flex justify-between pt-2">
              {editing ? (
                <Button variant="ghost" onClick={() => setStep(2)}>
                  <ArrowLeft className="mr-2 h-4 w-4" /> Sorulara dön
                </Button>
              ) : <span />}
              {editing ? (
                <Button onClick={() => updateMut.mutate()} disabled={!canSubmit || updateMut.isPending}>
                  {updateMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Kaydet ve devam
                </Button>
              ) : (
                <Button onClick={() => createMut.mutate()} disabled={!canSubmit || createMut.isPending}>
                  {createMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowRight className="mr-2 h-4 w-4" />}
                  Devam (sorular)
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ─── Adım 2 ───
  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
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
        <Card><CardContent className="p-5 text-sm text-slate-600">
          Bu tünel {tunnel.status} durumunda; düzenlenemez. Önizleme için Tünellerim sayfasını kullanın.
        </CardContent></Card>
      ) : (
        <>
          {/* Adım 1'e dön (meta düzenle) */}
          <div className="mb-3">
            <Button variant="outline" size="sm" onClick={() => setStep(1)}>
              <Pencil className="mr-1.5 h-4 w-4" /> Bilgileri düzenle (Adım 1)
            </Button>
          </div>

          {/* Katman sekmeleri */}
          <div className="mb-4 flex flex-wrap gap-1.5">
            {Array.from({ length: layerCount }, (_, i) => i + 1).map((idx) => {
              const cnt = layers.find((l) => l.index === idx)?.questions.length ?? 0;
              return (
                <button
                  key={idx}
                  onClick={() => setActiveLayer(idx)}
                  className={
                    "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium " +
                    (activeLayer === idx ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200")
                  }
                >
                  <Layers className="h-3.5 w-3.5" /> Katman {idx}
                  <span className={"rounded-full px-1.5 text-xs " + (activeLayer === idx ? "bg-white/20" : "bg-slate-200")}>{cnt}</span>
                </button>
              );
            })}
          </div>

          {/* Aktif katman soruları */}
          <LayerEditor
            key={activeLayer}
            layer={current}
            optionCount={optionCount}
            onChange={(qs) => updateLayer(activeLayer, qs)}
          />

          {/* Aksiyonlar */}
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="outline" onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
              {saveMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Taslağı Kaydet
            </Button>
            <Button onClick={() => submitMut.mutate()} disabled={submitMut.isPending}>
              {submitMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
              Onaya Gönder
            </Button>
          </div>
        </>
      )}
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

  return (
    <div className="space-y-3">
      {questions.length === 0 && (
        <p className="py-6 text-center text-sm text-slate-400">Bu katmanda henüz soru yok.</p>
      )}
      {questions.map((q, qi) => {
        const qImg = q._imgPreview || q.mediaUrl;
        const isOpen = openIndex === qi;
        const summary = (q.content || "").trim() || (qImg ? "(görsel soru)" : "(boş soru)");
        const hasCorrect = q.options?.some((o) => o.isCorrect);
        return (
          <Card key={qi}>
            <CardContent className="p-0">
              {/* Başlık satırı — tıkla aç/kapa + Düzenle + Sil */}
              <div className="flex items-center justify-between gap-2 p-3">
                <button
                  type="button"
                  onClick={() => setOpenIndex(isOpen ? null : qi)}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                >
                  <span className="flex-shrink-0 text-sm font-semibold text-slate-700">Soru {qi + 1}</span>
                  {!isOpen && <span className="truncate text-sm text-slate-500">{summary}</span>}
                  {!isOpen && !hasCorrect && (
                    <span className="flex-shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">doğru şık yok</span>
                  )}
                </button>
                <div className="flex flex-shrink-0 items-center gap-1">
                  {!isOpen && (
                    <Button variant="ghost" size="sm" onClick={() => setOpenIndex(qi)}>
                      <Pencil className="mr-1.5 h-4 w-4" /> Düzenle
                    </Button>
                  )}
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-red-600" onClick={() => removeQuestion(qi)} aria-label="Soruyu sil">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Gövde — yalnız açıkken */}
              {isOpen && (
                <div className="space-y-2 border-t border-slate-100 p-4 pt-3">
              <Textarea
                value={q.content}
                onChange={(e) => setQ(qi, { content: e.target.value })}
                rows={2}
                placeholder="Soru metni (görsel-only soru için boş bırakılabilir)"
              />
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
            </CardContent>
          </Card>
        );
      })}
      <Button variant="outline" onClick={addQuestion} className="w-full">
        <Plus className="mr-2 h-4 w-4" /> Soru Ekle
      </Button>
    </div>
  );
}
