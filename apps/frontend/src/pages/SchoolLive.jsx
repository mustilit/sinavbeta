import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { school as schoolApi } from "@/api/dalClient";
import api from "@/lib/api/apiClient";
import { useAuth } from "@/lib/AuthContext";
import { useAppNavigate, buildPageUrl } from "@/lib/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Radio, Plus, Trash2, Play, Eye, AlertCircle, ImagePlus, X } from "lucide-react";
import { toast } from "sonner";

const STATUS = { DRAFT: { l: "Taslak", c: "bg-slate-100 text-slate-600" }, ACTIVE: { l: "Yayında", c: "bg-emerald-100 text-emerald-700" }, ENDED: { l: "Bitti", c: "bg-slate-200 text-slate-500" } };

// Market canlı sınav editörü ile aynı yapı (uid + 5 şık + görsel). Tek fark: satın alma yok.
const uid = () => Math.random().toString(36).slice(2);
const LETTERS = ["A", "B", "C", "D", "E", "F"];
const emptyOption = () => ({ _k: uid(), content: "", mediaUrl: "", _imgFile: null, _imgPreview: null, isCorrect: false });
const emptyQuestion = () => ({ _k: uid(), content: "", mediaUrl: "", _imgFile: null, _imgPreview: null, options: [emptyOption(), emptyOption(), emptyOption(), emptyOption(), emptyOption()] });

async function doUpload(file) {
  const fd = new FormData();
  fd.append("file", file);
  const { data } = await api.post("/upload/image", fd);
  return data.url || data.fileUrl || data.file_url || "";
}

/** Tek soru kartı — market QuestionEditDialog ile aynı düzen (sol: soru+görsel, sağ: şıklar). */
function QuestionCard({ q, index, total, onUpdate, onUpdateOpt, onSetCorrect, onAddOpt, onRemoveOpt, onRemove }) {
  const qImg = q._imgPreview || q.mediaUrl || null;
  const correctKey = q.options.find((o) => o.isCorrect)?._k || "";
  return (
    <div className="rounded-xl border border-slate-200 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-slate-900">Soru {index + 1}</span>
        {total > 1 && (
          <button type="button" onClick={onRemove} className="inline-flex items-center gap-1 text-rose-500 hover:text-rose-600 text-sm">
            <Trash2 className="w-4 h-4" /> Sil
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-6 gap-y-4">
        {/* Sol: soru metni + görseli */}
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Soru Metni</Label>
            <Textarea rows={3} placeholder="Soru metnini giriniz..." value={q.content} onChange={(e) => onUpdate({ content: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Soru Görseli (İsteğe Bağlı)</Label>
            <div className="flex items-center gap-3 flex-wrap">
              <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border border-slate-200 bg-white hover:bg-slate-50 text-slate-600">
                <ImagePlus className="w-4 h-4" /> Görsel Seç
                <input type="file" accept="image/*" className="hidden" onChange={(e) => {
                  const f = e.target.files?.[0]; e.target.value = "";
                  if (!f) return;
                  if (q._imgPreview) URL.revokeObjectURL(q._imgPreview);
                  onUpdate({ _imgFile: f, _imgPreview: URL.createObjectURL(f), mediaUrl: "" });
                }} />
              </label>
              {qImg && (
                <>
                  <div className="w-16 h-12 rounded-lg overflow-hidden bg-slate-100 border border-slate-200 flex-shrink-0">
                    <img src={qImg} alt="" className="w-full h-full object-cover" />
                  </div>
                  <button type="button" onClick={() => { if (q._imgPreview) URL.revokeObjectURL(q._imgPreview); onUpdate({ _imgFile: null, _imgPreview: null, mediaUrl: "" }); }}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border border-rose-200 bg-white hover:bg-rose-50 text-rose-600">
                    <X className="w-4 h-4" /> Temizle
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Sağ: şıklar */}
        <div className="space-y-3">
          <Label>Seçenekler (doğru şıkkı işaretleyin)</Label>
          <RadioGroup value={correctKey} onValueChange={(v) => onSetCorrect(v)}>
            {q.options.map((opt, oi) => {
              const optImg = opt._imgPreview || opt.mediaUrl || null;
              const fillable = !!(opt.content.trim() || opt.mediaUrl || opt._imgFile);
              return (
                <div key={opt._k} className="p-3 rounded-lg bg-slate-50 space-y-2">
                  <div className="flex items-start gap-3">
                    <div className="flex items-center space-x-2 pt-1">
                      <RadioGroupItem value={opt._k} id={`sl-opt-${q._k}-${oi}`} disabled={!fillable} />
                      <label htmlFor={`sl-opt-${q._k}-${oi}`} className="text-sm font-semibold cursor-pointer">{LETTERS[oi]}</label>
                    </div>
                    <div className="flex-1 space-y-2">
                      <Input placeholder={`Seçenek ${LETTERS[oi]}`} value={opt.content} onChange={(e) => onUpdateOpt(oi, { content: e.target.value })} />
                      <div className="flex items-center gap-2 flex-wrap">
                        <label className="cursor-pointer inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium border border-slate-200 bg-white hover:bg-slate-50 text-slate-600">
                          <ImagePlus className="w-3 h-3" /> Görsel
                          <input type="file" accept="image/*" className="hidden" onChange={(e) => {
                            const f = e.target.files?.[0]; e.target.value = "";
                            if (!f) return;
                            if (opt._imgPreview) URL.revokeObjectURL(opt._imgPreview);
                            onUpdateOpt(oi, { _imgFile: f, _imgPreview: URL.createObjectURL(f), mediaUrl: "" });
                          }} />
                        </label>
                        {optImg && (
                          <>
                            <div className="w-12 h-9 rounded overflow-hidden bg-slate-100 border border-slate-200 flex-shrink-0">
                              <img src={optImg} alt="" className="w-full h-full object-cover" />
                            </div>
                            <button type="button" onClick={() => { if (opt._imgPreview) URL.revokeObjectURL(opt._imgPreview); onUpdateOpt(oi, { _imgFile: null, _imgPreview: null, mediaUrl: "" }); }}
                              className="text-rose-500 hover:text-rose-600"><X className="w-4 h-4" /></button>
                          </>
                        )}
                        {q.options.length > 2 && (
                          <button type="button" onClick={() => onRemoveOpt(oi)} className="ml-auto text-slate-400 hover:text-rose-500"><Trash2 className="w-4 h-4" /></button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </RadioGroup>
          {q.options.length < 6 && (
            <Button type="button" variant="ghost" size="sm" className="text-indigo-600 gap-1" onClick={onAddOpt}><Plus className="w-3.5 h-3.5" /> Şık Ekle</Button>
          )}
        </div>
      </div>
    </div>
  );
}

/** E-Sınıf — Canlı sınav: liste + market ile aynı zengin oluşturma (satın alma yok). */
export default function SchoolLive() {
  const { user } = useAuth();
  const navigate = useAppNavigate();
  const qc = useQueryClient();
  const role = user?.school?.schoolRole;
  const canCreate = ["SCHOOL_ADMIN", "BRANCH_ADMIN", "DEPT_HEAD", "TEACHER"].includes(role);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [questions, setQuestions] = useState([emptyQuestion()]);

  const { data: sessions = [], isLoading } = useQuery({ queryKey: ["esinif", "live-list"], queryFn: schoolApi.live.list, enabled: !!role });

  const create = useMutation({
    mutationFn: async () => {
      const payloadQs = [];
      for (const q of questions) {
        let qMedia = q.mediaUrl || "";
        if (q._imgFile) qMedia = await doUpload(q._imgFile);
        const opts = [];
        for (const o of q.options) {
          let oMedia = o.mediaUrl || "";
          if (o._imgFile) oMedia = await doUpload(o._imgFile);
          if (!o.content.trim() && !oMedia) continue; // boş şık atla (market deseni)
          opts.push({ content: o.content.trim(), ...(oMedia ? { mediaUrl: oMedia } : {}), isCorrect: !!o.isCorrect });
        }
        payloadQs.push({ content: q.content.trim(), ...(qMedia ? { mediaUrl: qMedia } : {}), options: opts });
      }
      return schoolApi.live.create({ title: title.trim(), questions: payloadQs });
    },
    onSuccess: (res) => { toast.success("Oturum oluşturuldu"); qc.invalidateQueries({ queryKey: ["esinif", "live-list"] }); setOpen(false); navigate(buildPageUrl("SchoolLiveHost", { id: res.id })); },
    onError: (e) => toast.error(e?.response?.data?.message ?? "Oluşturulamadı"),
  });

  if (!role) return <div className="max-w-lg mx-auto text-center py-20"><AlertCircle className="w-12 h-12 mx-auto mb-3 text-slate-300" /><h2 className="text-xl font-semibold text-slate-900">Erişim yok</h2></div>;

  // Soru/şık güncelleyiciler (immutable)
  const patchQ = (i, patch) => setQuestions((qs) => qs.map((q, idx) => (idx === i ? { ...q, ...patch } : q)));
  const patchOpt = (i, oi, patch) => setQuestions((qs) => qs.map((q, idx) => (idx === i ? { ...q, options: q.options.map((o, j) => (j === oi ? { ...o, ...patch } : o)) } : q)));
  const setCorrect = (i, key) => setQuestions((qs) => qs.map((q, idx) => (idx === i ? { ...q, options: q.options.map((o) => ({ ...o, isCorrect: o._k === key })) } : q)));
  const addOpt = (i) => setQuestions((qs) => qs.map((q, idx) => (idx === i && q.options.length < 6 ? { ...q, options: [...q.options, emptyOption()] } : q)));
  const removeOpt = (i, oi) => setQuestions((qs) => qs.map((q, idx) => (idx === i ? { ...q, options: q.options.filter((_, j) => j !== oi) } : q)));
  const removeQ = (i) => setQuestions((qs) => qs.filter((_, idx) => idx !== i));
  const reset = () => { setTitle(""); setQuestions([emptyQuestion()]); };

  const handleCreate = () => {
    if (!title.trim()) return toast.error("Başlık girin");
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (!q.content.trim() && !q._imgFile && !q.mediaUrl) return toast.error(`Soru ${i + 1}: metin veya görsel ekleyin`);
      const filled = q.options.filter((o) => o.content.trim() || o._imgFile || o.mediaUrl);
      if (filled.length < 2) return toast.error(`Soru ${i + 1}: en az 2 şık doldurun`);
      const correct = q.options.filter((o) => o.isCorrect);
      if (correct.length !== 1) return toast.error(`Soru ${i + 1}: bir doğru şık seçin`);
      const c = correct[0];
      if (!c.content.trim() && !c._imgFile && !c.mediaUrl) return toast.error(`Soru ${i + 1}: doğru şık boş olamaz`);
    }
    create.mutate();
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center"><Radio className="w-5 h-5 text-amber-600" /></div>
          <div><h1 className="text-2xl font-bold text-slate-900">Canlı Sınav</h1><p className="text-sm text-slate-500">Eş zamanlı, kodla katılımlı sınav</p></div>
        </div>
        {canCreate && <Button onClick={() => { reset(); setOpen(true); }} className="bg-amber-500 hover:bg-amber-600 gap-2"><Plus className="w-4 h-4" /> Yeni Oturum</Button>}
      </div>

      {isLoading ? (
        <div className="space-y-2">{[0, 1].map((i) => <div key={i} className="h-16 bg-slate-100 rounded-lg animate-pulse" />)}</div>
      ) : sessions.length === 0 ? (
        <div className="text-center py-16 text-slate-500"><Radio className="w-12 h-12 mx-auto mb-3 opacity-30" /><p>Henüz canlı oturum yok.</p></div>
      ) : (
        <div className="space-y-2">
          {sessions.map((s) => {
            const st = STATUS[s.status] ?? STATUS.DRAFT;
            return (
              <div key={s.id} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2"><span className="font-medium text-slate-900 truncate">{s.title}</span><Badge className={st.c}>{st.l}</Badge></div>
                  <p className="text-xs text-slate-500 mt-1">Kod: <span className="font-mono font-semibold">{s.joinCode}</span> · {s.questionCount} soru · {s.participantCount} katılımcı</p>
                </div>
                <Button size="sm" variant="outline" className="gap-1" onClick={() => navigate(buildPageUrl("SchoolLiveHost", { id: s.id }))}>{s.status === "ENDED" ? <Eye className="w-4 h-4" /> : <Play className="w-4 h-4" />} {s.status === "ENDED" ? "Görüntüle" : "Yönet"}</Button>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Yeni Canlı Oturum</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label htmlFor="sl-title">Başlık</Label><Input id="sl-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder="Örn. 8. Sınıf Matematik — Üslü Sayılar" /></div>
            {questions.map((q, i) => (
              <QuestionCard
                key={q._k} q={q} index={i} total={questions.length}
                onUpdate={(patch) => patchQ(i, patch)}
                onUpdateOpt={(oi, patch) => patchOpt(i, oi, patch)}
                onSetCorrect={(key) => setCorrect(i, key)}
                onAddOpt={() => addOpt(i)}
                onRemoveOpt={(oi) => removeOpt(i, oi)}
                onRemove={() => removeQ(i)}
              />
            ))}
            <Button type="button" variant="outline" onClick={() => setQuestions((qs) => [...qs, emptyQuestion()])} className="w-full gap-1"><Plus className="w-4 h-4" /> Soru Ekle</Button>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={create.isPending}>İptal</Button>
            <Button onClick={handleCreate} disabled={create.isPending || !title.trim()} className="bg-amber-500 hover:bg-amber-600">{create.isPending ? "Oluşturuluyor…" : "Oluştur"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
