import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { school as schoolApi } from "@/api/dalClient";
import { useAuth } from "@/lib/AuthContext";
import { useAppNavigate, buildPageUrl } from "@/lib/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Radio, Plus, Play, Eye, AlertCircle, ArrowLeft, Zap } from "lucide-react";
import { toast } from "sonner";
import { LiveQuestionsEditor, emptyQuestion } from "@/components/live/LiveQuestionsEditor";

const STATUS = { DRAFT: { l: "Taslak", c: "bg-slate-100 text-slate-600" }, ACTIVE: { l: "Yayında", c: "bg-emerald-100 text-emerald-700" }, ENDED: { l: "Bitti", c: "bg-slate-200 text-slate-500" } };

/**
 * E-Sınıf — Canlı sınav: liste + oluşturma. Oluşturma ekranı market eğitici
 * "Canlı Test Oluştur" ile AYNI soru editörünü (LiveQuestionsEditor) kullanır;
 * tek fark: satın alma/tier yok, konu seçimi/DOCX/kopya kontrolü kapalı.
 */
export default function SchoolLive() {
  const { user } = useAuth();
  const navigate = useAppNavigate();
  const qc = useQueryClient();
  const role = user?.school?.schoolRole;
  const canCreate = ["SCHOOL_ADMIN", "BRANCH_ADMIN", "DEPT_HEAD", "TEACHER"].includes(role);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [questions, setQuestions] = useState(() => [emptyQuestion()]);

  const { data: sessions = [], isLoading } = useQuery({ queryKey: ["esinif", "live-list"], queryFn: schoolApi.live.list, enabled: !!role });

  const create = useMutation({
    mutationFn: () => {
      const valid = questions.filter((q) => {
        const filled = q.options.filter((o) => o.content.trim() || o.mediaUrl);
        return (q.content.trim() || q.mediaUrl) && filled.length >= 2 && q.options.some((o) => o.isCorrect);
      });
      if (valid.length === 0) throw new Error("En az bir tamamlanmış soru gereklidir");
      const payload = {
        title: title.trim(),
        questions: valid.map((q) => ({
          content: q.content.trim(),
          mediaUrl: q.mediaUrl || undefined,
          options: q.options
            .filter((o) => o.content.trim() || o.mediaUrl)
            .map((o) => ({ content: o.content.trim(), mediaUrl: o.mediaUrl || undefined, isCorrect: o.isCorrect })),
        })),
      };
      return schoolApi.live.create(payload);
    },
    onSuccess: (res) => { toast.success("Oturum oluşturuldu"); qc.invalidateQueries({ queryKey: ["esinif", "live-list"] }); navigate(buildPageUrl("SchoolLiveHost", { id: res.id })); },
    onError: (e) => toast.error(e?.response?.data?.message ?? e?.message ?? "Oluşturulamadı"),
  });

  if (!role) return <div className="max-w-lg mx-auto text-center py-20"><AlertCircle className="w-12 h-12 mx-auto mb-3 text-slate-300" /><h2 className="text-xl font-semibold text-slate-900">Erişim yok</h2></div>;

  const startCreate = () => { setTitle(""); setQuestions([emptyQuestion()]); setCreating(true); };

  // ── Oluşturma ekranı (market editörü ile aynı) ──
  if (creating) {
    return (
      <div className="max-w-4xl mx-auto">
        <button onClick={() => setCreating(false)} className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-900 mb-6">
          <ArrowLeft className="w-4 h-4" /> Geri Dön
        </button>
        <h1 className="text-2xl font-bold text-slate-900 mb-1 flex items-center gap-2"><Zap className="w-6 h-6 text-amber-500" /> Canlı Sınav Oluştur</h1>
        <p className="text-slate-500 mb-8">Başlık girin ve soruları ekleyin.</p>

        <div className="space-y-6">
          <div className="space-y-2 max-w-xl">
            <Label htmlFor="sl-title">Başlık</Label>
            <Input id="sl-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder="Örn. 8. Sınıf Matematik — Üslü Sayılar" />
          </div>

          <LiveQuestionsEditor
            questions={questions}
            setQuestions={setQuestions}
            showTopic={false}
            checkDuplicate={false}
            showDocxImport={false}
          />

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setCreating(false)} disabled={create.isPending}>İptal</Button>
            <Button onClick={() => create.mutate()} disabled={create.isPending || !title.trim()} className="bg-amber-500 hover:bg-amber-600">
              {create.isPending ? "Oluşturuluyor…" : "Oluştur"}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ── Liste ekranı ──
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center"><Radio className="w-5 h-5 text-amber-600" /></div>
          <div><h1 className="text-2xl font-bold text-slate-900">Canlı Sınav</h1><p className="text-sm text-slate-500">Eş zamanlı, kodla katılımlı sınav</p></div>
        </div>
        {canCreate && <Button onClick={startCreate} className="bg-amber-500 hover:bg-amber-600 gap-2"><Plus className="w-4 h-4" /> Yeni Oturum</Button>}
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
    </div>
  );
}
