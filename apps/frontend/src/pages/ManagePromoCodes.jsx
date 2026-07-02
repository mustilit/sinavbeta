/**
 * ManagePromoCodes — Admin Platform Promo Code yönetimi (Sprint 15 #5).
 *
 * Eğitici canlı test (LiveSession) ve reklam paketi (AdPurchase) satın
 * almasında kullanabileceği admin-issued promo kodu CRUD. Scope checkbox'ları
 * ile hangi akışlarda geçerli olduğunu belirler.
 *
 * NOT: Bu admin tarafından yönetilen sistem geneli kod. Eğitici aday'a paket
 * indirimi vermek için ayrı `MyDiscountCodes` sayfasını kullanır.
 *
 * Yetki: ADMIN sadece (PAGE_ROLES'te tanımlı).
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { platformPromoCodes } from "@/api/dalClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Power, PowerOff, Ticket } from "lucide-react";
import toast from "react-hot-toast";

const SCOPE_LABEL = {
  LIVE_SESSION: "Canlı Test",
  AD_PACKAGE: "Reklam Paketi",
};

/**
 * Standalone sayfa: başlık + panel. Doğrudan /ManagePromoCodes route'undan
 * erişilebilir (sidebar'da olmasa da). Asıl yönetim UI'ı `PromoCodesPanel`
 * içinde; bu sayede `MyDiscountCodes` ikinci sekmesinde de yeniden kullanılır.
 */
export default function ManagePromoCodes() {
  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
          <Ticket className="w-8 h-8 text-indigo-600" />
          Platform Promo Kodları
        </h1>
        <p className="text-slate-500 mt-2">
          Eğiticilerin canlı test ve reklam paketi satın alımında kullanacağı admin-issued promo kodu.
        </p>
      </div>
      <PromoCodesPanel />
    </div>
  );
}

/**
 * Platform promo kodu yönetim paneli (başlıksız gövde) — hem standalone sayfada
 * hem `MyDiscountCodes` "Eğitici Promo Kodları" sekmesinde kullanılır.
 */
export function PromoCodesPanel() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [filterScope, setFilterScope] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["platform-promo-codes", filterScope],
    queryFn: () =>
      platformPromoCodes.list({
        scope: filterScope || undefined,
        limit: 100,
      }),
  });

  const deleteMutation = useMutation({
    mutationFn: (/** @type {any} */ id) => platformPromoCodes.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["platform-promo-codes"] });
      toast.success("Promo kodu silindi");
    },
    onError: () => toast.error("Silme başarısız"),
  });

  const toggleMutation = useMutation({
    mutationFn: (/** @type {any} */ { id, isActive }) => platformPromoCodes.toggle(id, isActive),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["platform-promo-codes"] });
    },
    onError: () => toast.error("Durum değişikliği başarısız"),
  });

  const handleDelete = (id, usedCount) => {
    const msg =
      usedCount > 0
        ? `Bu kod ${usedCount} kez kullanılmış. Silmek raporlama kayıtlarını silecek. Devam edilsin mi?`
        : "Bu promo kodu silmek istediğinize emin misiniz?";
    if (window.confirm(msg)) {
      deleteMutation.mutate(id);
    }
  };

  const items = data?.items ?? [];

  return (
    <div>
      {/* Açıklama + Yeni Kod */}
      <div className="flex items-start justify-between mb-4 gap-3">
        <p className="text-sm text-slate-500">
          Eğiticilerin canlı test ve reklam paketi satın alımında kullanacağı admin-issued promo kodu.
        </p>
        <Button
          onClick={() => setShowForm(!showForm)}
          className="bg-indigo-600 hover:bg-indigo-700 flex-shrink-0"
        >
          <Plus className="w-4 h-4 mr-2" />
          Yeni Kod
        </Button>
      </div>

      {showForm && <CreatePromoForm onClose={() => setShowForm(false)} />}

      {/* Filtre */}
      <div className="mb-4 flex items-center gap-2">
        <span className="text-sm text-slate-600">Scope:</span>
        <select
          value={filterScope}
          onChange={(e) => setFilterScope(e.target.value)}
          className="border border-slate-200 rounded-md px-3 py-1.5 text-sm"
          aria-label="Scope filtresi"
        >
          <option value="">Tümü</option>
          <option value="LIVE_SESSION">Canlı Test</option>
          <option value="AD_PACKAGE">Reklam Paketi</option>
        </select>
      </div>

      {/* Tablo */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-slate-500">Yükleniyor...</div>
        ) : items.length === 0 ? (
          <div className="p-12 text-center">
            <Ticket className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-600">Henüz promo kodu yok.</p>
            <p className="text-sm text-slate-400 mt-1">"Yeni Kod" ile ilk kodu oluşturun.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200 text-sm text-slate-600">
              <tr>
                <th scope="col" className="text-left px-4 py-3">Kod</th>
                <th scope="col" className="text-left px-4 py-3">İndirim</th>
                <th scope="col" className="text-left px-4 py-3">Scope</th>
                <th scope="col" className="text-left px-4 py-3">Kullanım</th>
                <th scope="col" className="text-left px-4 py-3">Geçerlilik</th>
                <th scope="col" className="text-left px-4 py-3">Durum</th>
                <th scope="col" className="text-right px-4 py-3">İşlem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {items.map((promo) => (
                <tr key={promo.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-mono font-semibold text-slate-900">{promo.code}</td>
                  <td className="px-4 py-3">%{promo.percentOff}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1 flex-wrap">
                      {(promo.scopes ?? []).map((s) => (
                        <Badge key={s} variant="secondary" className="text-xs">
                          {SCOPE_LABEL[s] ?? s}
                        </Badge>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {promo.usedCount}
                    {promo.maxUses != null ? ` / ${promo.maxUses}` : " / ∞"}
                  </td>
                  <td className="px-4 py-3 text-slate-600 text-xs">
                    {promo.validFrom && new Date(promo.validFrom).toLocaleDateString("tr-TR")}
                    {promo.validFrom && promo.validUntil && " — "}
                    {promo.validUntil && new Date(promo.validUntil).toLocaleDateString("tr-TR")}
                    {!promo.validFrom && !promo.validUntil && "Süresiz"}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={promo.isActive ? "default" : "secondary"}>
                      {promo.isActive ? "Aktif" : "Pasif"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={promo.isActive ? "Pasife al" : "Aktifleştir"}
                        onClick={() =>
                          toggleMutation.mutate({ id: promo.id, isActive: !promo.isActive })
                        }
                      >
                        {promo.isActive ? (
                          <PowerOff className="w-4 h-4 text-amber-600" />
                        ) : (
                          <Power className="w-4 h-4 text-emerald-600" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Sil"
                        onClick={() => handleDelete(promo.id, promo.usedCount)}
                      >
                        <Trash2 className="w-4 h-4 text-rose-600" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>
    </div>
  );
}

/** Yeni promo kodu formu (inline, dialog yerine accordion benzeri). */
function CreatePromoForm({ onClose }) {
  const queryClient = useQueryClient();
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [percentOff, setPercentOff] = useState(10);
  const [scopes, setScopes] = useState([]);
  const [maxUses, setMaxUses] = useState("");
  const [validUntil, setValidUntil] = useState("");

  const createMutation = useMutation({
    mutationFn: () =>
      platformPromoCodes.create({
        code: code.trim().toUpperCase(),
        description: description.trim() || undefined,
        percentOff: Number(percentOff),
        scopes,
        maxUses: maxUses ? Number(maxUses) : undefined,
        validUntil: validUntil ? new Date(validUntil).toISOString() : undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["platform-promo-codes"] });
      toast.success("Promo kodu oluşturuldu");
      onClose();
    },
    onError: (err) => {
      const code = err?.response?.data?.code;
      const map = {
        DUPLICATE_CODE: "Bu kod zaten mevcut",
        CODE_INVALID: "Kod en az 3 karakter ve yalnızca harf/rakam/-_",
        PERCENT_INVALID: "İndirim 1-100 arası olmalı",
        SCOPES_REQUIRED: "En az bir scope seçin",
      };
      toast.error(map[code] || "Oluşturma başarısız");
    },
  });

  const toggleScope = (scope) => {
    setScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope],
    );
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!code.trim() || scopes.length === 0) {
      toast.error("Kod ve en az bir scope zorunlu");
      return;
    }
    createMutation.mutate();
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="mb-6 bg-white rounded-2xl border border-slate-200 p-6 space-y-4"
    >
      <h2 className="font-semibold text-slate-900">Yeni Promo Kodu</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label htmlFor="promo-code" className="block text-sm font-medium text-slate-700 mb-1">
            Kod *
          </label>
          <Input
            id="promo-code"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="LAUNCH50"
            required
            minLength={3}
          />
        </div>
        <div>
          <label htmlFor="promo-percent" className="block text-sm font-medium text-slate-700 mb-1">
            İndirim % *
          </label>
          <Input
            id="promo-percent"
            type="number"
            min={1}
            max={100}
            value={percentOff}
            onChange={(e) => setPercentOff(e.target.value)}
            required
          />
        </div>
      </div>

      <div>
        <label htmlFor="promo-desc" className="block text-sm font-medium text-slate-700 mb-1">
          Açıklama (opsiyonel)
        </label>
        <Input
          id="promo-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Yeni eğitici kampanyası"
        />
      </div>

      <fieldset>
        <legend className="block text-sm font-medium text-slate-700 mb-2">
          Geçerli olduğu akışlar *
        </legend>
        <div className="flex gap-4">
          {["LIVE_SESSION", "AD_PACKAGE"].map((s) => (
            <label key={s} className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={scopes.includes(s)}
                onChange={() => toggleScope(s)}
                className="rounded border-slate-300 text-indigo-600"
              />
              {SCOPE_LABEL[s]}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label htmlFor="promo-maxuses" className="block text-sm font-medium text-slate-700 mb-1">
            Maks. kullanım (boş = sınırsız)
          </label>
          <Input
            id="promo-maxuses"
            type="number"
            min={1}
            value={maxUses}
            onChange={(e) => setMaxUses(e.target.value)}
            placeholder="Örn: 100"
          />
        </div>
        <div>
          <label htmlFor="promo-validuntil" className="block text-sm font-medium text-slate-700 mb-1">
            Bitiş tarihi (opsiyonel)
          </label>
          <Input
            id="promo-validuntil"
            type="date"
            value={validUntil}
            onChange={(e) => setValidUntil(e.target.value)}
          />
        </div>
      </div>

      <div className="flex gap-2 justify-end">
        <Button type="button" variant="outline" onClick={onClose}>
          İptal
        </Button>
        <Button type="submit" disabled={createMutation.isPending} className="bg-indigo-600">
          {createMutation.isPending ? "Oluşturuluyor..." : "Oluştur"}
        </Button>
      </div>
    </form>
  );
}
