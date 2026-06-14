import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Layers, Loader2, Play, ShoppingCart, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { candidateTunnels as api } from "@/api/dalClient";
import { createPageUrl } from "@/utils";

/**
 * Aday tünel pazarı — yayınlanmış tüneller; satın al / başla-devam et.
 * Tünelde testler/katmanlar görünmez; aday yalnız konuyu ve ilerlemeyi görür.
 */
export default function Tunnels() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["candidateTunnels"],
    queryFn: () => api.list(),
    staleTime: 30_000,
  });
  const items = data?.items ?? [];

  const [buyTarget, setBuyTarget] = useState(null); // { id, title, priceCents }
  const [discountCode, setDiscountCode] = useState("");

  const buyMut = useMutation({
    mutationFn: ({ id, code }) => api.purchase(id, code || undefined),
    onSuccess: (_r, vars) => {
      toast.success("Tünel kütüphanene eklendi");
      queryClient.invalidateQueries({ queryKey: ["candidateTunnels"] });
      setBuyTarget(null);
      setDiscountCode("");
      navigate(createPageUrl("TakeTunnel") + `?id=${vars.id}`);
    },
    onError: (e) => toast.error(e?.message || "Satın alınamadı"),
  });

  const openBuy = (t) => { setBuyTarget(t); setDiscountCode(""); };

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
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {items.map((t) => (
            <li key={t.id}>
              <Card>
                <CardContent className="flex h-full flex-col p-4">
                  <div className="flex-1">
                    <div className="font-semibold text-slate-900">{t.title}</div>
                    {t.description && <p className="mt-1 line-clamp-2 text-xs text-slate-500">{t.description}</p>}
                    <div className="mt-2 flex flex-wrap gap-x-3 text-xs text-slate-500">
                      {t.examTypeName && <span>{t.examTypeName}</span>}
                      {t.topicName && <span>· {t.topicName}</span>}
                      <span>· {t.layerCount} katman</span>
                      {t.educatorUsername && <span>· {t.educatorUsername}</span>}
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="font-bold text-slate-800">
                      {t.priceCents > 0 ? `₺${(t.priceCents / 100).toFixed(0)}` : "Ücretsiz"}
                    </span>
                    {t.purchased ? (
                      <Button size="sm" onClick={() => navigate(createPageUrl("TakeTunnel") + `?id=${t.id}`)}>
                        {t.attemptStatus === "COMPLETED" ? (
                          <><CheckCircle2 className="mr-1.5 h-4 w-4" /> Tamamlandı</>
                        ) : (
                          <><Play className="mr-1.5 h-4 w-4" /> {t.attemptStatus ? "Devam Et" : "Başla"}</>
                        )}
                      </Button>
                    ) : (
                      <Button size="sm" onClick={() => openBuy(t)}>
                        <ShoppingCart className="mr-1.5 h-4 w-4" /> Satın Al
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {/* Satın alma modalı — opsiyonel indirim kodu */}
      <Dialog open={!!buyTarget} onOpenChange={(o) => !o && setBuyTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Tüneli Satın Al</DialogTitle>
          </DialogHeader>
          {buyTarget && (
            <div className="space-y-3">
              <p className="text-sm text-slate-600">
                <strong>{buyTarget.title}</strong> —{" "}
                {buyTarget.priceCents > 0 ? `₺${(buyTarget.priceCents / 100).toFixed(0)}` : "Ücretsiz"}
              </p>
              {buyTarget.priceCents > 0 && (
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">İndirim kodu (opsiyonel)</label>
                  <Input value={discountCode} onChange={(e) => setDiscountCode(e.target.value)} placeholder="Kod" maxLength={64} />
                </div>
              )}
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="ghost" onClick={() => setBuyTarget(null)} disabled={buyMut.isPending}>Vazgeç</Button>
                <Button onClick={() => buyMut.mutate({ id: buyTarget.id, code: discountCode.trim() })} disabled={buyMut.isPending}>
                  {buyMut.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <ShoppingCart className="mr-1.5 h-4 w-4" />}
                  Satın Al
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
