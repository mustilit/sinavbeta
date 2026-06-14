import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Layers, Loader2, Play, ShoppingCart, CheckCircle2, FileText, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PaymentModal } from "@/components/ui/PaymentModal";
import { candidateTunnels as api } from "@/api/dalClient";
import { createPageUrl } from "@/utils";

/**
 * Aday tünel pazarı — yayınlanmış tüneller; satın al / başla-devam et.
 * Satın alma, normal test paketleriyle AYNI ekranı (PaymentModal) kullanır:
 * indirim kodu + mesafeli satış sözleşmesi + ödeme tercihi.
 */
export default function Tunnels() {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ["candidateTunnels"],
    queryFn: () => api.list(),
    staleTime: 30_000,
  });
  const items = data?.items ?? [];

  const [buyTarget, setBuyTarget] = useState(null); // tünel kartı

  const openBuy = (t) => setBuyTarget(t);

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <header className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
          <Layers className="h-6 w-6 text-indigo-600" /> Tüneller
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Bir konuyu, çeldirici şıklara rağmen tüm sorularını doğru cevaplayana kadar derinlemesine öğren.
        </p>
      </header>

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
      ) : items.length === 0 ? (
        <p className="py-16 text-center text-sm text-slate-500">Şu an yayınlanmış tünel yok.</p>
      ) : (
        <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((t) => (
            <li key={t.id}>
              <div className="group flex h-full flex-col overflow-hidden rounded-2xl border border-slate-100 bg-white transition-all duration-300 hover:shadow-xl hover:shadow-slate-200/50">
                {/* Kapak */}
                <div className="relative h-40 overflow-hidden" style={{ backgroundColor: t.coverImageUrl ? "transparent" : "#0000CD" }}>
                  {t.coverImageUrl ? (
                    <img src={t.coverImageUrl} alt={t.title} className="h-full w-full object-cover" />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Layers className="h-16 w-16 text-white/30" />
                    </div>
                  )}
                  {/* Tünel etiketi */}
                  <div className="absolute left-3 top-3">
                    <Badge className="bg-indigo-600/95 text-white backdrop-blur-sm hover:bg-indigo-600">
                      <Layers className="mr-1 h-3 w-3" /> Tünel
                    </Badge>
                  </div>
                  {t.examTypeName && (
                    <div className="absolute right-3 top-3">
                      <Badge className="bg-white/90 text-slate-700 backdrop-blur-sm hover:bg-white">{t.examTypeName}</Badge>
                    </div>
                  )}
                </div>

                {/* Gövde */}
                <div className="flex flex-1 flex-col p-5">
                  <h3 className="line-clamp-2 text-lg font-semibold text-slate-900">{t.title}</h3>
                  {t.topicName && <p className="mt-1 text-sm text-slate-500">{t.topicName}</p>}
                  {t.educatorUsername && (
                    <span className="mt-2 flex items-center gap-1.5 text-sm text-slate-500">
                      <User className="h-4 w-4 flex-shrink-0" />
                      <span className="truncate">{t.educatorUsername}</span>
                    </span>
                  )}
                  <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-slate-500">
                    <span className="flex items-center gap-1"><Layers className="h-4 w-4" /> {t.layerCount} katman</span>
                    {t.questionCount > 0 && (
                      <span className="flex items-center gap-1"><FileText className="h-4 w-4" /> {t.questionCount} soru</span>
                    )}
                  </div>

                  <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
                    <span className="text-2xl font-bold text-slate-900">
                      {t.priceCents > 0 ? `₺${(t.priceCents / 100).toFixed(0)}` : "Ücretsiz"}
                    </span>
                    {t.purchased ? (
                      <Button size="sm" className="bg-indigo-600 text-white hover:bg-indigo-700" onClick={() => navigate(createPageUrl("TakeTunnel") + `?id=${t.id}`)}>
                        {t.attemptStatus === "COMPLETED" ? (
                          <><CheckCircle2 className="mr-1.5 h-4 w-4" /> Tamamlandı</>
                        ) : (
                          <><Play className="mr-1.5 h-4 w-4" /> {t.attemptStatus ? "Devam Et" : "Başla"}</>
                        )}
                      </Button>
                    ) : (
                      <Button size="sm" className="bg-indigo-600 text-white hover:bg-indigo-700" onClick={() => openBuy(t)}>
                        <ShoppingCart className="mr-1.5 h-4 w-4" /> Satın Al
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Satın alma — normal test paketleriyle AYNI ekran (kod + sözleşme + ödeme) */}
      <PaymentModal
        kind="tunnel"
        isOpen={!!buyTarget}
        onClose={() => setBuyTarget(null)}
        test={buyTarget ? { id: buyTarget.id, title: buyTarget.title, price: (buyTarget.priceCents ?? 0) / 100 } : undefined}
        onPurchased={() => {
          const id = buyTarget?.id;
          toast.success("Tünel kütüphanene eklendi");
          setBuyTarget(null);
          if (id) navigate(createPageUrl("TakeTunnel") + `?id=${id}`);
        }}
      />
    </div>
  );
}
