import { useState } from "react";
import { adminAdPackages as adPkgsApi } from "@/api/dalClient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, CheckCircle2, X, Megaphone } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * AdminAdPackages — admin reklam paketleri yönetim CRUD'u.
 * MyAds (eğitici reklam satın alma) sayfası GET /ad-packages'ten okur;
 * burada tanımlanan aktif paketler oraya düşer. Dropdown'da "Şu an
 * satışta paket bulunmuyor" mesajının görünmemesi için en az 1 aktif
 * paket tanımlı olmalı.
 */

function AdPackageForm({ initial, onSave, onCancel, isPending }) {
  const [name, setName] = useState(initial?.name ?? "");
  const [durationDays, setDurationDays] = useState(
    initial?.durationDays != null ? String(initial.durationDays) : "30",
  );
  const [impressions, setImpressions] = useState(
    initial?.impressions != null ? String(initial.impressions) : "1000",
  );
  const [price, setPrice] = useState(
    initial?.priceCents != null ? String(initial.priceCents / 100) : "0",
  );
  const [active, setActive] = useState(initial?.active ?? true);

  const handleSubmit = () => {
    if (!name.trim()) { toast.error("Paket adı gerekli"); return; }
    const dDays = parseInt(durationDays, 10);
    const imp = parseInt(impressions, 10);
    const priceCents = Math.round(parseFloat(price) * 100);
    if (isNaN(dDays) || dDays < 1) { toast.error("Süre en az 1 gün olmalı"); return; }
    if (isNaN(imp) || imp < 1) { toast.error("Gösterim sayısı en az 1 olmalı"); return; }
    if (isNaN(priceCents) || priceCents < 0) { toast.error("Geçerli fiyat girin"); return; }
    onSave({
      name: name.trim(),
      durationDays: dDays,
      impressions: imp,
      priceCents,
      currency: "TRY",
      active,
    });
  };

  return (
    <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <Label className="text-xs mb-1 block">Paket Adı</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="ör. Standart Reklam (30 gün, 1.000 gösterim)"
            className="h-8 text-sm"
          />
        </div>
        <div>
          <Label className="text-xs mb-1 block">Süre (gün)</Label>
          <Input
            type="number"
            min="1"
            value={durationDays}
            onChange={(e) => setDurationDays(e.target.value)}
            className="h-8 text-sm"
          />
        </div>
        <div>
          <Label className="text-xs mb-1 block">Gösterim Sayısı</Label>
          <Input
            type="number"
            min="1"
            value={impressions}
            onChange={(e) => setImpressions(e.target.value)}
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
        <div className="flex items-end">
          <label className="inline-flex items-center gap-2 cursor-pointer text-sm">
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
              className="w-4 h-4"
            />
            <span>Satışta (eğiticilere göster)</span>
          </label>
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

function formatPrice(cents) {
  if (cents == null) return "—";
  return `₺${(cents / 100).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function AdminAdPackages() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(null); // null | 'new' | <packageId>

  const { data: packages = [], isLoading, isError } = useQuery({
    queryKey: ["adminAdPackages"],
    queryFn: () => adPkgsApi.list({ activeOnly: false }),
    staleTime: 30_000,
  });

  const createMut = useMutation({
    mutationFn: (/** @type {any} */ body) => adPkgsApi.create(body),
    onSuccess: () => {
      toast.success("Paket oluşturuldu");
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["adminAdPackages"] });
      qc.invalidateQueries({ queryKey: ["adPackages"] });
    },
    onError: (e) => toast.error(e?.response?.data?.message ?? e?.message ?? "Oluşturma başarısız"),
  });

  const updateMut = useMutation({
    mutationFn: (/** @type {any} */ { id, body }) => adPkgsApi.update(id, body),
    onSuccess: () => {
      toast.success("Paket güncellendi");
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["adminAdPackages"] });
      qc.invalidateQueries({ queryKey: ["adPackages"] });
    },
    onError: (e) => toast.error(e?.response?.data?.message ?? e?.message ?? "Güncelleme başarısız"),
  });

  const deleteMut = useMutation({
    mutationFn: (/** @type {any} */ id) => adPkgsApi.remove(id),
    onSuccess: () => {
      toast.success("Paket silindi");
      qc.invalidateQueries({ queryKey: ["adminAdPackages"] });
      qc.invalidateQueries({ queryKey: ["adPackages"] });
    },
    onError: (e) => toast.error(e?.response?.data?.message ?? e?.message ?? "Silme başarısız"),
  });

  const handleDelete = (pkg) => {
    if (!confirm(`"${pkg.name}" paketini silmek istediğine emin misin?`)) return;
    deleteMut.mutate(pkg.id);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-violet-50 flex items-center justify-center">
              <Megaphone className="w-5 h-5 text-violet-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Reklam Paketleri</h1>
              <p className="text-sm text-slate-500">
                Eğiticilerin "Reklamı Satın Al" akışında göreceği paketleri tanımla
              </p>
            </div>
          </div>
        </div>
        {editing !== 'new' && (
          <Button
            size="sm"
            className="bg-indigo-600 hover:bg-indigo-700"
            onClick={() => setEditing('new')}
          >
            <Plus className="w-4 h-4 mr-1.5" /> Yeni Paket
          </Button>
        )}
      </div>

      {/* Açıklama kartı */}
      <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 text-sm text-indigo-900 space-y-1">
        <p className="font-medium">Nasıl çalışır?</p>
        <ul className="list-disc list-inside text-xs space-y-0.5 text-indigo-800">
          <li><b>Süre (gün)</b>: Paket satın alındıktan sonra reklamın yayında kalacağı maksimum gün sayısı.</li>
          <li><b>Gösterim</b>: Reklam tüketildikçe azalır; süresi dolmadan biterse reklam otomatik kapanır.</li>
          <li><b>Satışta</b> kapalı olursa eğitici dropdown'unda görünmez (mevcut satın almalar etkilenmez).</li>
        </ul>
      </div>

      {/* Yeni paket formu */}
      {editing === 'new' && (
        <AdPackageForm
          initial={null}
          isPending={createMut.isPending}
          onCancel={() => setEditing(null)}
          onSave={(body) => createMut.mutate(body)}
        />
      )}

      {/* Liste */}
      {isLoading ? (
        <div className="text-center text-slate-400 py-8">Yükleniyor…</div>
      ) : isError ? (
        <div className="text-center text-rose-500 py-8">Paketler yüklenemedi</div>
      ) : packages.length === 0 ? (
        <div className="text-center py-12 bg-white border border-dashed border-slate-300 rounded-xl">
          <Megaphone className="w-10 h-10 text-slate-300 mx-auto mb-2" />
          <p className="text-slate-500">Henüz paket tanımlanmadı.</p>
          <p className="text-xs text-slate-400 mt-1">"Yeni Paket" butonuyla ilk paketi ekleyebilirsin.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {packages.map((pkg) => (
            <div
              key={pkg.id}
              className={cn(
                "p-4 bg-white border rounded-xl",
                pkg.active ? "border-slate-200" : "border-slate-200 opacity-70",
              )}
            >
              {editing === pkg.id ? (
                <AdPackageForm
                  initial={pkg}
                  isPending={updateMut.isPending}
                  onCancel={() => setEditing(null)}
                  onSave={(body) => updateMut.mutate({ id: pkg.id, body })}
                />
              ) : (
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-[200px]">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-semibold text-slate-900">{pkg.name}</p>
                      {pkg.active ? (
                        <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                          Satışta
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-slate-500 border-slate-300">
                          Pasif
                        </Badge>
                      )}
                    </div>
                    <div className="flex gap-4 text-xs text-slate-600 flex-wrap">
                      <span><b>{pkg.durationDays}</b> gün</span>
                      <span><b>{pkg.impressions?.toLocaleString("tr-TR")}</b> gösterim</span>
                      <span className="font-semibold text-emerald-600">
                        {formatPrice(pkg.priceCents)}
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button size="sm" variant="ghost" onClick={() => setEditing(pkg.id)}>
                      <Pencil className="w-3.5 h-3.5 mr-1" /> Düzenle
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-rose-600 hover:bg-rose-50"
                      onClick={() => handleDelete(pkg)}
                      disabled={deleteMut.isPending}
                    >
                      <Trash2 className="w-3.5 h-3.5 mr-1" /> Sil
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
