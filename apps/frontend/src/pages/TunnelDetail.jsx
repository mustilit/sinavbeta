import { useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Layers, BookOpen, FileText, User, Play, CheckCircle2, ShoppingCart, ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PaymentModal } from "@/components/ui/PaymentModal";
import { candidateTunnels as api } from "@/api/dalClient";
import { createPageUrl } from "@/utils";

/**
 * Tünel detay sayfası — TestDetail ile aynı yapı (hero + 2 sütun: bilgi + sticky
 * satın alma paneli). Satın alma normal paketlerle aynı PaymentModal'ı kullanır.
 */
export default function TunnelDetail() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const id = params.get("id");
  const [buyOpen, setBuyOpen] = useState(false);

  const { data: t, isLoading, isError } = useQuery({
    queryKey: ["tunnelMeta", id],
    queryFn: () => api.meta(id),
    enabled: !!id,
    staleTime: 30_000,
  });

  if (isLoading) {
    return <div className="flex min-h-[40vh] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-indigo-500" /></div>;
  }
  if (isError || !t) {
    return <div className="mx-auto max-w-xl px-4 py-16 text-center text-slate-500">Tünel bulunamadı.</div>;
  }

  const priceTL = (t.priceCents ?? 0) / 100;
  const isFree = (t.priceCents ?? 0) === 0;
  const goSolve = () => navigate(createPageUrl("TakeTunnel") + `?id=${t.id}`);

  const features = [
    { icon: Layers, label: "Katman", value: t.layerCount },
    { icon: FileText, label: "Soru", value: t.questionCount },
    { icon: BookOpen, label: "Sınav Türü", value: t.examTypeName || "—" },
    { icon: User, label: "Eğitici", value: t.educatorUsername || "—" },
  ];

  return (
    <div className="max-w-4xl mx-auto">
      <button onClick={() => navigate(createPageUrl("Explore"))} className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-4 w-4" /> Geri
      </button>

      {/* Hero */}
      <div className="relative mb-8 h-64 overflow-hidden rounded-2xl" style={{ backgroundColor: t.coverImageUrl ? "transparent" : "#0000CD" }}>
        {t.coverImageUrl ? (
          <img src={t.coverImageUrl} alt={t.title} className="h-full w-full object-cover" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center"><Layers className="h-24 w-24 text-white/30" /></div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
        <div className="absolute left-6 top-6 flex gap-2">
          <Badge className="bg-indigo-600/95 text-white"><Layers className="mr-1 h-3 w-3" /> Tünel</Badge>
          {t.examTypeName && <Badge className="bg-white/90 text-slate-700">{t.examTypeName}</Badge>}
        </div>
        <div className="absolute bottom-6 left-6 right-6">
          <h1 className="text-3xl font-bold text-white">{t.title}</h1>
          {t.topicName && <p className="mt-1 text-white/80">{t.topicName}</p>}
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-3">
        {/* Ana içerik */}
        <div className="space-y-6 lg:col-span-2">
          {t.description && (
            <div className="rounded-2xl border border-slate-200 bg-white p-6">
              <h2 className="mb-2 font-semibold text-slate-900">Açıklama</h2>
              <p className="whitespace-pre-wrap text-slate-600">{t.description}</p>
            </div>
          )}

          <div className="rounded-2xl border border-slate-200 bg-white p-6">
            <h2 className="mb-4 font-semibold text-slate-900">Tünel Bilgileri</h2>
            <div className="grid grid-cols-2 gap-4">
              {features.map((f, i) => (
                <div key={i} className="flex items-center gap-3 rounded-xl bg-slate-50 p-3">
                  <f.icon className="h-5 w-5 flex-shrink-0 text-indigo-600" />
                  <div className="min-w-0">
                    <p className="text-xs text-slate-500">{f.label}</p>
                    <p className="truncate font-semibold text-slate-800">{f.value}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6">
            <h2 className="mb-2 font-semibold text-slate-900">Nasıl çalışır?</h2>
            <p className="text-sm text-slate-600">
              Tünelde her soru aynı anda 5 seçenekle gelir; doğru cevap her zaman içindedir.
              Bir soruyu farklı seçenek dizilişleriyle en az 3 kez doğru cevapladığında "öğrenildi"
              sayılır. Tüm katmanlar öğrenilince tüneli tamamlarsın.
            </p>
          </div>
        </div>

        {/* Sticky satın alma / başlama paneli */}
        <div className="lg:col-span-1">
          <div className="sticky top-24 rounded-2xl border border-slate-200 bg-white p-6">
            <div className="mb-6 text-center">
              <p className="text-4xl font-bold text-slate-900">{isFree ? "Ücretsiz" : `₺${priceTL.toFixed(0)}`}</p>
            </div>

            {t.purchased ? (
              <Button className="h-12 w-full bg-indigo-600 hover:bg-indigo-700" onClick={goSolve}>
                {t.attemptStatus === "COMPLETED" ? (<><CheckCircle2 className="mr-2 h-5 w-5" /> Tekrar Çöz</>) : (<><Play className="mr-2 h-5 w-5" /> {t.attemptStatus ? "Devam Et" : "Başla"}</>)}
              </Button>
            ) : (
              <Button className="h-12 w-full bg-indigo-600 hover:bg-indigo-700" onClick={() => setBuyOpen(true)}>
                <ShoppingCart className="mr-2 h-5 w-5" /> Satın Al
              </Button>
            )}

            <div className="mt-6 space-y-3 text-sm text-slate-600">
              <div className="flex items-center gap-2"><Layers className="h-4 w-4 text-indigo-600" /> {t.layerCount} katman</div>
              <div className="flex items-center gap-2"><FileText className="h-4 w-4 text-indigo-600" /> {t.questionCount} soru</div>
              {t.educatorUsername && <div className="flex items-center gap-2"><User className="h-4 w-4 text-indigo-600" /> {t.educatorUsername}</div>}
            </div>
          </div>
        </div>
      </div>

      <PaymentModal
        kind="tunnel"
        isOpen={buyOpen}
        onClose={() => setBuyOpen(false)}
        test={{ id: t.id, title: t.title, price: priceTL }}
        onPurchased={() => {
          toast.success("Tünel satın alındı");
          setBuyOpen(false);
          queryClient.invalidateQueries({ queryKey: ["tunnelMeta", id] });
          queryClient.invalidateQueries({ queryKey: ["candidateTunnels"] });
        }}
      />
    </div>
  );
}
