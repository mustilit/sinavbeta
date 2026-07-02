import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { entities } from "@/api/dalClient";
import api from "@/lib/api/apiClient";
import { useAuth } from "@/lib/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Percent, Copy, Search, X, PowerOff, Power } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { format, parseISO, startOfDay, endOfDay } from "date-fns";
import { tr } from "date-fns/locale";
// Sprint 15 — Admin "Eğitici Promo Kodları" sekmesi (PlatformPromoCode CRUD).
// Standalone ManagePromoCodes sayfasının gövdesi; burada ikinci sekme olarak gömülür.
import { PromoCodesPanel } from "./ManagePromoCodes";

/**
 * MyDiscountCodes (İndirim Kodlarım) sayfası — eğiticinin kendi test
 * paketleri için indirim kodu oluşturmasını, listelemesini ve silmesini sağlar.
 * Kodlar eğiticinin e-postasına bağlıdır; maksimum indirim oranı %50 ile sınırlandırılmıştır.
 */
export default function MyDiscountCodes() {
  const { t } = useTranslation(["pages"]);
  const { user } = useAuth();
  const isAdmin = (user?.role || "").toUpperCase() === "ADMIN";
  // Sekme: 'discount' (aday indirim kodları) | 'promo' (admin → eğitici platform promo).
  // 'promo' sekmesi yalnızca admin'e gösterilir.
  const [activeTab, setActiveTab] = useState("discount");
  // Yeni kod oluşturma diyaloğunun açık/kapalı durumu
  const [showDialog, setShowDialog] = useState(false);
  // Yeni kod formu alanları; varsayılan değerler: %10 indirim, 100 kullanım hakkı
  const [formData, setFormData] = useState({
    code: "",
    discount_percent: 10,
    max_uses: 100,
    test_package_id: "",
    valid_until: ""
  });
  // Filtre durumu
  const [filters, setFilters] = useState({
    search: "",
    minPercent: "",
    maxPercent: "",
    dateFrom: "",
    dateTo: "",
  });
  const queryClient = useQueryClient();

  // Admin tüm kodları görür; eğitici yalnızca kendi oluşturduklarını
  const { data: codes = [], isLoading } = useQuery({
    queryKey: ["discountCodes", isAdmin ? "ALL" : user?.email],
    queryFn: () =>
      isAdmin
        ? entities.DiscountCode.adminFilter()
        : entities.DiscountCode.filter({ educator_email: user.email }, "-created_date"),
    enabled: !!user,
  });

  // Admin tarafından belirlenen maksimum indirim sınırı.
  // /site/service-status public endpoint — eğitici dahil tüm roller okuyabilir.
  const { data: serviceStatus } = useQuery({
    queryKey: ["serviceStatus"],
    queryFn: async () => {
      try {
        const { data } = await api.get("/site/service-status");
        return data;
      } catch {
        return null;
      }
    },
    staleTime: 60_000,
  });
  const maxDiscountForEducator = serviceStatus?.maxDiscountPercent ?? 50;
  // Admin'in kendisi sınırla kısıtlı değildir (1-100 arası)
  const effectiveMaxDiscount = isAdmin ? 100 : maxDiscountForEducator;

  // Aktif filtre sayısını hesapla (rozet için)
  const activeFilterCount = [filters.search, filters.minPercent, filters.maxPercent, filters.dateFrom, filters.dateTo]
    .filter(Boolean).length;

  // Filtrelenmiş kod listesi — tüm filtreler istemci tarafında uygulanır
  const filteredCodes = useMemo(() => {
    return codes.filter((c) => {
      // Kod numarası / metin araması
      if (filters.search && !c.code.toLowerCase().includes(filters.search.toLowerCase())) return false;
      // İndirim oranı aralığı (backend alanı: percentOff veya discount_percent)
      const pct = c.percentOff ?? c.discount_percent ?? 0;
      if (filters.minPercent !== "" && pct < Number(filters.minPercent)) return false;
      if (filters.maxPercent !== "" && pct > Number(filters.maxPercent)) return false;
      // Tarih aralığı — kodun geçerlilik başlangıç tarihine (validFrom/valid_from) göre filtrele
      const refDate = c.createdAt ?? c.created_date;
      if (refDate) {
        const d = new Date(refDate);
        if (filters.dateFrom && d < startOfDay(parseISO(filters.dateFrom))) return false;
        if (filters.dateTo   && d > endOfDay(parseISO(filters.dateTo)))     return false;
      }
      return true;
    });
  }, [codes, filters]);

  const clearFilters = () => setFilters({ search: "", minPercent: "", maxPercent: "", dateFrom: "", dateTo: "" });

  // Kod oluşturma formunda belirli bir teste kısıtlama yapılabilmesi için eğiticinin testleri
  const { data: myTests = [] } = useQuery({
    queryKey: ["myTests", user?.email],
    queryFn: () => entities.TestPackage.filter({ educator_owns: true }),
    enabled: !!user,
  });

  // Kodu backend'e kaydeder; rol bazlı endpoint seçilir
  const createMutation = useMutation({
    mutationFn: (/** @type {any} */ data) =>
      isAdmin
        ? entities.DiscountCode.adminCreate(data)
        : entities.DiscountCode.create({
            ...data,
            educator_email: user.email,
            current_uses: 0,
            is_active: true,
          }),
    onSuccess: () => {
      toast.success(t("pages:myDiscountCodes.toasts.created"));
      queryClient.invalidateQueries({ queryKey: ["discountCodes"] });
      setShowDialog(false);
      setFormData({ code: "", discount_percent: 10, max_uses: 100, test_package_id: "", valid_until: "" });
    },
    onError: (err) => {
      const msg = err?.response?.data?.message || err?.message || t("pages:myDiscountCodes.toasts.createFailed");
      toast.error(msg);
    },
  });

  const toggleMutation = useMutation({
    mutationFn: (/** @type {any} */ id) => isAdmin ? entities.DiscountCode.adminToggle(id) : entities.DiscountCode.toggle(id),
    onSuccess: (data) => {
      const msg = data?.isActive ? t("pages:myDiscountCodes.toasts.activated") : t("pages:myDiscountCodes.toasts.deactivated");
      toast.success(msg);
      queryClient.invalidateQueries({ queryKey: ["discountCodes"] });
    },
    onError: (err) => {
      toast.error(err?.response?.data?.message || err?.message || t("pages:myDiscountCodes.toasts.toggleFailed"));
    },
  });

  // Formu doğrular ve kodu oluşturur.
  // Eğitici için: admin tarafından belirlenen `maxDiscountPercent` üst sınırı zorunlu.
  // Admin için: 1-100 aralığında esnek (admin override).
  const handleSubmit = () => {
    if (!formData.code || formData.discount_percent < 1) {
      toast.error(t("pages:myDiscountCodes.toasts.fillRequired"));
      return;
    }
    if (formData.discount_percent > effectiveMaxDiscount) {
      toast.error(t("pages:myDiscountCodes.toasts.maxPercent", { max: effectiveMaxDiscount }));
      return;
    }
    createMutation.mutate(formData);
  };

  // Kodu panoya kopyalar ve kullanıcıya bildirim gösterir
  const copyCode = (code) => {
    navigator.clipboard.writeText(code);
    toast.success(t("pages:myDiscountCodes.toasts.codeCopied"));
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">
            {t("pages:titles.myDiscountCodes")}
          </h1>
          <p className="text-slate-500 mt-2">
            {t("pages:titles.myDiscountCodesDesc")}
          </p>
        </div>
        {/* "Yeni Kod" butonu yalnızca aday indirim kodu sekmesinde; promo sekmesinin
            kendi "Yeni Kod" butonu PromoCodesPanel içindedir. */}
        {(!isAdmin || activeTab === "discount") && (
          <Button onClick={() => setShowDialog(true)} className="bg-indigo-600 hover:bg-indigo-700">
            <Plus className="w-4 h-4 mr-2" />
            {t("pages:myDiscountCodes.newCode")}
          </Button>
        )}
      </div>

      {/* Sekmeler — yalnızca admin: aday indirim kodları + eğitici platform promo kodları */}
      {isAdmin && (
        <div className="flex flex-wrap gap-1 mb-6 border-b border-slate-200 dark:border-gray-800">
          <button
            type="button"
            onClick={() => setActiveTab("discount")}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors min-h-10 ${
              activeTab === "discount"
                ? "border-indigo-600 text-indigo-600 dark:text-indigo-400"
                : "border-transparent text-slate-600 hover:text-slate-900 dark:text-gray-400 dark:hover:text-gray-100"
            }`}
          >
            {t("pages:myDiscountCodes.tabs.candidateCodes")}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("promo")}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors min-h-10 ${
              activeTab === "promo"
                ? "border-indigo-600 text-indigo-600 dark:text-indigo-400"
                : "border-transparent text-slate-600 hover:text-slate-900 dark:text-gray-400 dark:hover:text-gray-100"
            }`}
          >
            {t("pages:myDiscountCodes.tabs.educatorPromos")}
          </button>
        </div>
      )}

      {/* ─── Eğitici Platform Promo Kodları sekmesi (admin) ─── */}
      {isAdmin && activeTab === "promo" && <PromoCodesPanel />}

      {/* ─── Aday İndirim Kodları sekmesi (varsayılan) ─── */}
      {(!isAdmin || activeTab === "discount") && (<>
      {/* Filtre Paneli */}
      <Card className="mb-4">
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3 items-end">
            {/* Kod arama */}
            <div className="flex-1 min-w-[160px] space-y-1">
              <Label className="text-xs text-slate-500">{t("pages:myDiscountCodes.filter.codeLabel")}</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <Input
                  className="pl-8 h-9 text-sm"
                  placeholder={t("pages:myDiscountCodes.filter.codePlaceholder")}
                  value={filters.search}
                  onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
                />
              </div>
            </div>

            {/* İndirim oranı aralığı */}
            <div className="space-y-1 min-w-[80px]">
              <Label className="text-xs text-slate-500">{t("pages:myDiscountCodes.filter.minPercent")}</Label>
              <Input
                type="number"
                min="1"
                max="50"
                className="h-9 text-sm w-24"
                placeholder="1"
                value={filters.minPercent}
                onChange={(e) => setFilters((f) => ({ ...f, minPercent: e.target.value }))}
              />
            </div>
            <div className="space-y-1 min-w-[80px]">
              <Label className="text-xs text-slate-500">{t("pages:myDiscountCodes.filter.maxPercent")}</Label>
              <Input
                type="number"
                min="1"
                max="50"
                className="h-9 text-sm w-24"
                placeholder="50"
                value={filters.maxPercent}
                onChange={(e) => setFilters((f) => ({ ...f, maxPercent: e.target.value }))}
              />
            </div>

            {/* Oluşturma tarihi aralığı */}
            <div className="space-y-1 min-w-[140px]">
              <Label className="text-xs text-slate-500">{t("pages:myDiscountCodes.filter.dateFrom")}</Label>
              <Input
                type="date"
                className="h-9 text-sm"
                value={filters.dateFrom}
                onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value }))}
              />
            </div>
            <div className="space-y-1 min-w-[140px]">
              <Label className="text-xs text-slate-500">{t("pages:myDiscountCodes.filter.dateTo")}</Label>
              <Input
                type="date"
                className="h-9 text-sm"
                value={filters.dateTo}
                onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value }))}
              />
            </div>

            {/* Filtreleri temizle */}
            {activeFilterCount > 0 && (
              <Button variant="ghost" size="sm" className="h-9 text-slate-500 hover:text-slate-800 gap-1.5" onClick={clearFilters}>
                <X className="w-3.5 h-3.5" />
                {t("pages:myDiscountCodes.filter.clear")}
                <Badge className="bg-indigo-100 text-indigo-700 ml-0.5">{activeFilterCount}</Badge>
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 bg-slate-100 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : codes.length === 0 ? (
            <div className="text-center py-12">
              <Percent className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500">{t("pages:myDiscountCodes.empty.noCodes")}</p>
            </div>
          ) : filteredCodes.length === 0 ? (
            <div className="text-center py-12">
              <Search className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500">{t("pages:myDiscountCodes.empty.noResults")}</p>
              <Button variant="link" className="text-indigo-600 mt-1" onClick={clearFilters}>{t("pages:myDiscountCodes.empty.clearFilters")}</Button>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {filteredCodes.map((code) => (
                <div key={code.id} className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-indigo-50 rounded-xl">
                      <Percent className="w-5 h-5 text-indigo-600" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-mono font-bold text-slate-900">{code.code}</p>
                        <button onClick={() => copyCode(code.code)} className="text-slate-400 hover:text-slate-600">
                          <Copy className="w-4 h-4" />
                        </button>
                      </div>
                      <p className="text-sm text-slate-500">
                        {t("pages:myDiscountCodes.card.discountUsage", {
                          pct: code.percentOff ?? code.discount_percent,
                          used: code.usedCount ?? code.current_uses ?? 0,
                          max: code.maxUses ?? code.max_uses ?? t("pages:myDiscountCodes.card.infinite"),
                        })}
                      </p>
                      {isAdmin && code.creatorUsername && (
                        <p className="text-xs text-slate-400 mt-0.5">
                          {t("pages:myDiscountCodes.card.createdBy")}{" "}
                          {/* creatorUsername user-generated */}
                          <span className="font-medium text-slate-600">{code.creatorUsername}</span>
                          {code.creatorRole && (
                            <Badge className={`ml-1.5 ${code.creatorRole === "ADMIN" ? "bg-indigo-100 text-indigo-700" : "bg-emerald-100 text-emerald-700"}`}>
                              {code.creatorRole === "ADMIN" ? t("pages:myDiscountCodes.card.roles.admin") : t("pages:myDiscountCodes.card.roles.educator")}
                            </Badge>
                          )}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <Badge className={(() => {
                      const active  = code.isActive ?? code.is_active ?? true;
                      const used    = code.usedCount ?? code.current_uses ?? 0;
                      const max     = code.maxUses  ?? code.max_uses;
                      const expired = code.validUntil && new Date(code.validUntil) < new Date();
                      const full    = max != null && used >= max;
                      return (active && !expired && !full) ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600";
                    })()}>
                      {(() => {
                        const active  = code.isActive ?? code.is_active ?? true;
                        const used    = code.usedCount ?? code.current_uses ?? 0;
                        const max     = code.maxUses  ?? code.max_uses;
                        const expired = code.validUntil && new Date(code.validUntil) < new Date();
                        if (!active)                    return t("pages:myDiscountCodes.card.status.passive");
                        if (expired)                    return t("pages:myDiscountCodes.card.status.expired");
                        if (max != null && used >= max) return t("pages:myDiscountCodes.card.status.limitReached");
                        return t("pages:myDiscountCodes.card.status.active");
                      })()}
                    </Badge>
                    {(code.validUntil ?? code.valid_until) && (
                      <span className="text-sm text-slate-500">
                        {format(new Date(code.validUntil ?? code.valid_until), "d MMM yyyy", { locale: tr })}
                      </span>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={toggleMutation.isPending}
                      className={code.isActive ?? code.is_active ? "text-slate-400 hover:text-rose-600" : "text-emerald-600 hover:text-emerald-700"}
                      title={code.isActive ?? code.is_active ? t("pages:myDiscountCodes.card.toggleDeactivate") : t("pages:myDiscountCodes.card.toggleActivate")}
                      onClick={() => toggleMutation.mutate(code.id)}
                    >
                      {code.isActive ?? code.is_active
                        ? <PowerOff className="w-4 h-4" />
                        : <Power className="w-4 h-4" />}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      </>)}

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("pages:myDiscountCodes.dialog.title")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>{t("pages:myDiscountCodes.dialog.codeLabel")}</Label>
              <Input
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                placeholder={t("pages:myDiscountCodes.dialog.codePlaceholder")}
                className="uppercase"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t("pages:myDiscountCodes.dialog.percentLabel")}</Label>
                <Input
                  type="number"
                  min="1"
                  max={effectiveMaxDiscount}
                  value={formData.discount_percent}
                  onChange={(e) => setFormData({ ...formData, discount_percent: Number(e.target.value) })}
                />
                <p className="text-xs text-slate-500">
                  {t("pages:myDiscountCodes.dialog.percentMax", { max: effectiveMaxDiscount })}
                  {isAdmin && t("pages:myDiscountCodes.dialog.adminOverride")}
                </p>
              </div>
              <div className="space-y-2">
                <Label>{t("pages:myDiscountCodes.dialog.maxUsesLabel")}</Label>
                <Input
                  type="number"
                  min="1"
                  value={formData.max_uses}
                  onChange={(e) => setFormData({ ...formData, max_uses: Number(e.target.value) })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t("pages:myDiscountCodes.dialog.validForLabel")}</Label>
              <Select value={formData.test_package_id} onValueChange={(v) => setFormData({ ...formData, test_package_id: v })}>
                <SelectTrigger>
                  <SelectValue placeholder={t("pages:myDiscountCodes.dialog.allTests")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={null}>{t("pages:myDiscountCodes.dialog.allTests")}</SelectItem>
                  {/* test.title user-generated — çevrilmez */}
                  {myTests.map((test) => (
                    <SelectItem key={test.id} value={test.id}>{test.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("pages:myDiscountCodes.dialog.validUntilLabel")}</Label>
              <Input
                type="date"
                value={formData.valid_until}
                onChange={(e) => setFormData({ ...formData, valid_until: e.target.value })}
              />
            </div>
            <div className="flex gap-3 justify-end pt-4">
              <Button variant="outline" onClick={() => setShowDialog(false)}>{t("pages:myDiscountCodes.dialog.cancel")}</Button>
              <Button
                onClick={handleSubmit}
                disabled={createMutation.isPending}
                className="bg-indigo-600 hover:bg-indigo-700"
              >
                {t("pages:myDiscountCodes.dialog.create")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}