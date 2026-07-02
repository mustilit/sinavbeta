import { useState } from "react";
import { liveSessionTiers as tiersApi } from "@/api/dalClient";
import { useAuth } from "@/lib/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Pagination } from "@/components/ui/Pagination";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Users, CheckCircle2, X, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

function TierForm({ initial = null, onSave, onCancel, isPending }) {
  const [label, setLabel] = useState(initial?.label ?? "");
  const [maxP, setMaxP] = useState(initial?.maxParticipants == null ? "" : String(initial.maxParticipants));
  const [price, setPrice] = useState(initial?.priceCents != null ? String(initial.priceCents / 100) : "0");
  const [order, setOrder] = useState(String(initial?.order ?? 0));

  const handleSubmit = () => {
    if (!label.trim()) { toast.error("Paket adı gerekli"); return; }
    const max = maxP === "" ? null : parseInt(maxP, 10);
    const priceCents = Math.round(parseFloat(price) * 100);
    if (max !== null && (isNaN(max) || max < 1)) { toast.error("Maks katılımcı en az 1 olmalı"); return; }
    if (isNaN(priceCents) || priceCents < 0) { toast.error("Geçerli fiyat girin"); return; }
    onSave({
      label: label.trim(),
      minParticipants: 0,
      maxParticipants: max,
      priceCents,
      order: parseInt(order, 10) || 0,
    });
  };

  return (
    <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <Label className="text-xs mb-1 block">Paket Adı</Label>
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="ör. Başlangıç (max 20 kişi)"
            className="h-8 text-sm"
          />
        </div>
        <div>
          <Label className="text-xs mb-1 block">Maks Katılımcı (boş = sınırsız)</Label>
          <Input
            type="number"
            min="1"
            value={maxP}
            onChange={(e) => setMaxP(e.target.value)}
            placeholder="Sınırsız"
            className="h-8 text-sm"
          />
        </div>
        <div>
          <Label className="text-xs mb-1 block">Fiyat (₺)</Label>
          <Input
            type="number"
            min="0"
            step="0.01"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className="h-8 text-sm"
          />
        </div>
        <div>
          <Label className="text-xs mb-1 block">Sıra</Label>
          <Input
            type="number"
            min="0"
            value={order}
            onChange={(e) => setOrder(e.target.value)}
            className="h-8 text-sm"
          />
        </div>
      </div>
      <div className="flex gap-2 justify-end">
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={isPending}>
          <X className="w-3.5 h-3.5 mr-1" /> İptal
        </Button>
        <Button
          size="sm"
          className="bg-indigo-600 hover:bg-indigo-700"
          onClick={handleSubmit}
          disabled={isPending}
        >
          {isPending
            ? "Kaydediliyor..."
            : <><CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Kaydet</>}
        </Button>
      </div>
    </div>
  );
}

export default function ManageLiveTiers() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const isAdmin = (user?.role || "").toUpperCase() === "ADMIN";

  const { data: tiers = [], isLoading } = useQuery({
    queryKey: ["liveTiersAdmin"],
    queryFn: () => tiersApi.listAdmin(),
    enabled: isAdmin,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["liveTiersAdmin"] });

  const extractMsg = (e) =>
    e?.response?.data?.error?.message ||
    e?.response?.data?.message ||
    e?.message ||
    "İşlem başarısız";

  const createMut = useMutation({
    mutationFn: (/** @type {any} */ body) => tiersApi.create(body),
    onSuccess: () => { invalidate(); setShowAdd(false); toast.success("Paket oluşturuldu"); },
    onError: (e) => toast.error(extractMsg(e)),
  });

  const updateMut = useMutation({
    mutationFn: (/** @type {any} */ { id, body }) => tiersApi.update(id, body),
    onSuccess: () => { invalidate(); setEditingId(null); toast.success("Paket güncellendi"); },
    onError: (e) => toast.error(extractMsg(e)),
  });

  const deleteMut = useMutation({
    mutationFn: (/** @type {any} */ id) => tiersApi.remove(id),
    onSuccess: () => { invalidate(); toast.success("Paket silindi"); },
    onError: (e) => toast.error(extractMsg(e)),
  });

  if (!isAdmin) {
    return <div className="text-center py-20 text-slate-500">Erişim engellendi</div>;
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Zap className="w-6 h-6 text-amber-500" /> Canlı Test Kapasite Paketleri
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Eğiticilerin canlı test oluştururken seçeceği kapasite ve fiyat paketleri
          </p>
        </div>
        <Button
          className="bg-indigo-600 hover:bg-indigo-700 gap-2"
          onClick={() => { setShowAdd(true); setEditingId(null); }}
        >
          <Plus className="w-4 h-4" /> Paket Ekle
        </Button>
      </div>

      {showAdd && (
        <div className="mb-4">
          <TierForm
            onSave={(body) => createMut.mutate(body)}
            onCancel={() => setShowAdd(false)}
            isPending={createMut.isPending}
          />
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-white rounded-xl border border-slate-200 animate-pulse" />
          ))}
        </div>
      ) : tiers.length === 0 && !showAdd ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-slate-200">
          <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500">Henüz kapasite paketi yok</p>
          <p className="text-sm text-slate-400 mt-1">İlk paketi oluşturun</p>
        </div>
      ) : (
        <>
        <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
          {tiers.slice((page - 1) * pageSize, page * pageSize).map((tier) => {
            const capacityLabel = tier.maxParticipants == null
              ? "Sınırsız katılımcı"
              : `Maks ${tier.maxParticipants} katılımcı`;
            const priceLabel = tier.priceCents === 0
              ? "Ücretsiz"
              : `₺${(tier.priceCents / 100).toFixed(2)}`;

            return (
              <div key={tier.id}>
                {editingId === tier.id ? (
                  <div className="p-3">
                    <TierForm
                      initial={tier}
                      onSave={(body) => updateMut.mutate({ id: tier.id, body })}
                      onCancel={() => setEditingId(null)}
                      isPending={updateMut.isPending}
                    />
                  </div>
                ) : (
                  <div className="flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center shrink-0">
                        <span className="text-xs font-bold text-indigo-700">{tier.order}</span>
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-slate-900">{tier.label}</p>
                          {!tier.isActive && (
                            <Badge className="bg-slate-100 text-slate-500 border-0 text-xs">Pasif</Badge>
                          )}
                        </div>
                        <p className="text-sm text-slate-500 flex items-center gap-1">
                          <Users className="w-3.5 h-3.5" /> {capacityLabel}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 ml-4 shrink-0">
                      <span className={cn(
                        "font-semibold",
                        tier.priceCents === 0 ? "text-emerald-600" : "text-slate-900"
                      )}>
                        {priceLabel}
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-slate-400 hover:text-indigo-600"
                        onClick={() => { setEditingId(tier.id); setShowAdd(false); }}
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-slate-400 hover:text-rose-600"
                        disabled={deleteMut.isPending}
                        onClick={() => {
                          if (confirm(`"${tier.label}" paketini silmek istediğinize emin misiniz?`)) {
                            deleteMut.mutate(tier.id);
                          }
                        }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <Pagination page={page} pageSize={pageSize} total={tiers.length} onPageChange={setPage} onPageSizeChange={setPageSize} />
        </>
      )}

      <div className="mt-6 bg-amber-50 border border-amber-200 rounded-xl p-4">
        <p className="text-sm text-amber-800 font-medium mb-1">💡 Nasıl çalışır?</p>
        <ul className="text-sm text-amber-700 space-y-1 list-disc list-inside">
          <li>Eğitici canlı test oluştururken bu paketlerden birini seçer</li>
          <li>Seçilen paketteki maks katılımcı sayısı aşıldığında yeni katılım engellenir</li>
          <li>Maks katılımcı boş bırakılırsa sınırsız katılım olur</li>
        </ul>
      </div>
    </div>
  );
}
