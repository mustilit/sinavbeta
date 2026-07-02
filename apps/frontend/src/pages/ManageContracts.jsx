/**
 * ManageContracts — Admin yasal sözleşme yönetimi (Sprint 16).
 *
 * Sprint 14'te 4 sözleşme tipi seed edildi (placeholder "ŞABLON METİN — AVUKAT
 * ONAYI GEREKLİ"). Bu sayfa admin'in bu metinleri DÜZENLEMESİNİ, yeni versiyon
 * yayımlamasını ve aktif versiyonu seçmesini sağlar. Backend: /admin/contracts.
 *
 * Tipler: CANDIDATE (üyelik) · EDUCATOR (eğitici hizmet) · PRIVACY (KVKK) ·
 *         DISTANCE_SALE (mesafeli satış). Her tip için birden çok versiyon
 *         tutulabilir; yalnızca biri aktif (kullanıcıya gösterilen) olur.
 *
 * Yetki: ADMIN (routeRoles.js).
 */
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import { contracts as contractsApi } from "@/api/dalClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { FileText, Plus, Pencil, CheckCircle2, AlertTriangle, Eye, Code } from "lucide-react";

const TYPES = [
  { value: "CANDIDATE", label: "Üyelik / Kullanım", slug: "uyelik" },
  { value: "EDUCATOR", label: "Eğitici Hizmet", slug: "egitici-hizmet" },
  { value: "PRIVACY", label: "KVKK Aydınlatma", slug: "kvkk" },
  { value: "DISTANCE_SALE", label: "Mesafeli Satış", slug: "mesafeli-satis" },
];

export default function ManageContracts() {
  const queryClient = useQueryClient();
  // editing: { mode: 'create' | 'edit', type, contract? } | null
  const [editing, setEditing] = useState(null);

  const {
    data: allContracts = [],
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ["admin-contracts"],
    queryFn: () => contractsApi.adminList(), // filtresiz → 4 tip de gelir
  });
  // Hata mesajını çöz (401 → oturum, 403 → yetki, diğer → genel)
  const errStatus = error?.response?.status ?? error?.status;
  const errMessage =
    errStatus === 401
      ? "Oturumunuz sona ermiş olabilir. Çıkış yapıp tekrar giriş yapın."
      : errStatus === 403
        ? "Bu sayfa için admin yetkisi gerekiyor."
        : "Sözleşmeler yüklenemedi (sunucuya ulaşılamadı veya hata). Tekrar deneyin.";

  const setActiveMutation = useMutation({
    mutationFn: (/** @type {any} */ id) => contractsApi.adminSetActive(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-contracts"] });
      toast.success("Aktif versiyon güncellendi");
    },
    onError: (err) => toast.error(err?.response?.data?.message || "İşlem başarısız"),
  });

  // Tip → o tipe ait versiyonlar (versiyon desc sıralı)
  const byType = useMemo(() => {
    const map = {};
    for (const ty of TYPES) map[ty.value] = [];
    for (const c of allContracts) {
      if (map[c.type]) map[c.type].push(c);
    }
    for (const ty of TYPES) {
      map[ty.value].sort((a, b) => (b.version ?? 0) - (a.version ?? 0));
    }
    return map;
  }, [allContracts]);

  const nextVersionFor = (type) => {
    const list = byType[type] ?? [];
    const max = list.reduce((m, c) => Math.max(m, c.version ?? 0), 0);
    return max + 1;
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
          <FileText className="w-8 h-8 text-indigo-600" />
          Sözleşme Yönetimi
        </h1>
        <p className="text-slate-500 mt-2">
          Yasal metinleri düzenleyin, yeni versiyon yayımlayın ve aktif versiyonu seçin.
        </p>
      </div>

      {/* Avukat onayı uyarısı — Sprint 14 placeholder metinler */}
      <div className="mb-6 flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
        <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold">Production öncesi avukat onayı zorunlu</p>
          <p className="text-amber-700 mt-0.5">
            Seed ile gelen metinler şablondur. Yayına almadan önce hukuk danışmanı onaylı
            sürümle değiştirin. Aktif versiyon, kayıt ve satın alma akışlarında kullanıcıya gösterilir.
          </p>
        </div>
      </div>

      {/* Yükleme/hata sebebini açıkça göster — sessiz "boş" görünümünü engelle */}
      {isError && (
        <div
          role="alert"
          className="mb-6 flex items-start justify-between gap-3 p-4 bg-rose-50 border border-rose-200 rounded-xl text-sm text-rose-800"
        >
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-5 h-5 text-rose-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Sözleşmeler yüklenemedi</p>
              <p className="text-rose-700 mt-0.5">{errMessage}</p>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex-shrink-0"
          >
            {isFetching ? "..." : "Tekrar dene"}
          </Button>
        </div>
      )}

      <Tabs defaultValue="CANDIDATE">
        <TabsList>
          {TYPES.map((ty) => (
            <TabsTrigger key={ty.value} value={ty.value}>
              {ty.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {TYPES.map((ty) => (
          <TabsContent key={ty.value} value={ty.value}>
            <div className="flex items-center justify-between mb-4">
              <a
                href={`/sozlesmeler/${ty.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-indigo-600 underline hover:no-underline"
              >
                Public sayfayı gör →
              </a>
              <Button
                onClick={() => setEditing({ mode: "create", type: ty.value })}
                className="bg-indigo-600 hover:bg-indigo-700"
              >
                <Plus className="w-4 h-4 mr-2" />
                Yeni Versiyon
              </Button>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              {isLoading ? (
                <div className="p-8 text-center text-slate-500">Yükleniyor...</div>
              ) : isError ? (
                <div className="p-12 text-center">
                  <AlertTriangle className="w-12 h-12 text-rose-300 mx-auto mb-3" />
                  <p className="text-slate-600">Liste yüklenemedi.</p>
                  <p className="text-sm text-slate-400 mt-1">Yukarıdaki uyarıdan "Tekrar dene"yi kullanın.</p>
                </div>
              ) : (byType[ty.value] ?? []).length === 0 ? (
                <div className="p-12 text-center">
                  <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                  <p className="text-slate-600">Bu tip için henüz sözleşme yok.</p>
                  <p className="text-sm text-slate-400 mt-1">"Yeni Versiyon" ile ilk metni oluşturun.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50 border-b border-slate-200 text-sm text-slate-600">
                    <tr>
                      <th scope="col" className="text-left px-4 py-3 w-20">Versiyon</th>
                      <th scope="col" className="text-left px-4 py-3">Başlık</th>
                      <th scope="col" className="text-left px-4 py-3 w-28">Durum</th>
                      <th scope="col" className="text-left px-4 py-3 w-36">Güncellenme</th>
                      <th scope="col" className="text-right px-4 py-3 w-44">İşlem</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {(byType[ty.value] ?? []).map((c) => (
                      <tr key={c.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-mono font-semibold text-slate-900">v{c.version}</td>
                        <td className="px-4 py-3 text-slate-700">{c.title}</td>
                        <td className="px-4 py-3">
                          {c.isActive ? (
                            <Badge className="bg-emerald-100 text-emerald-700">
                              <CheckCircle2 className="w-3 h-3 mr-1 inline" />
                              Aktif
                            </Badge>
                          ) : (
                            <Badge variant="secondary">Pasif</Badge>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-500 text-xs">
                          {c.updatedAt ? new Date(c.updatedAt).toLocaleDateString("tr-TR") : "—"}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex justify-end gap-2">
                            {!c.isActive && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setActiveMutation.mutate(c.id)}
                                disabled={setActiveMutation.isPending}
                              >
                                Aktif Yap
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setEditing({ mode: "edit", type: ty.value, contract: c })}
                            >
                              <Pencil className="w-4 h-4 mr-1" />
                              Düzenle
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
          </TabsContent>
        ))}
      </Tabs>

      {editing && (
        <ContractEditor
          editing={editing}
          defaultVersion={editing.mode === "create" ? nextVersionFor(editing.type) : undefined}
          onClose={() => setEditing(null)}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ["admin-contracts"] });
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

/** Oluşturma/düzenleme dialog'u — başlık + markdown içerik + aktiflik + önizleme. */
function ContractEditor({ editing, defaultVersion, onClose, onSaved }) {
  const isCreate = editing.mode === "create";
  const contract = editing.contract;
  const typeLabel = TYPES.find((t) => t.value === editing.type)?.label ?? editing.type;

  const [title, setTitle] = useState(contract?.title ?? "");
  const [content, setContent] = useState(contract?.content ?? "");
  const [version, setVersion] = useState(defaultVersion ?? contract?.version ?? 1);
  const [isActive, setIsActive] = useState(contract?.isActive ?? false);
  const [preview, setPreview] = useState(false);

  const saveMutation = useMutation({
    mutationFn: () => {
      if (isCreate) {
        return contractsApi.adminCreate({
          type: editing.type,
          version: Number(version),
          title: title.trim(),
          content: content.trim(),
          isActive,
        });
      }
      return contractsApi.adminUpdate(contract.id, {
        title: title.trim(),
        content: content.trim(),
        isActive,
      });
    },
    onSuccess: () => {
      toast.success(isCreate ? "Yeni versiyon oluşturuldu" : "Sözleşme güncellendi");
      onSaved();
    },
    onError: (err) => {
      const code = err?.response?.data?.code || err?.code;
      const map = {
        VERSION_EXISTS: "Bu versiyon numarası bu tip için zaten mevcut",
        INVALID_INPUT: "Başlık ve içerik zorunlu, versiyon ≥ 1 olmalı",
      };
      toast.error(map[code] || err?.response?.data?.message || "Kaydetme başarısız");
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) {
      toast.error("Başlık ve içerik zorunlu");
      return;
    }
    saveMutation.mutate();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isCreate ? `Yeni Versiyon — ${typeLabel}` : `Düzenle — ${typeLabel} v${contract.version}`}
          </DialogTitle>
          <DialogDescription>
            İçerik Markdown formatındadır. Kaydettikten sonra "Aktif Yap" ile kullanıcıya gösterilen
            versiyonu seçebilirsiniz.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <label htmlFor="contract-title" className="block text-sm font-medium text-slate-700 mb-1">
                Başlık *
              </label>
              <Input
                id="contract-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Üyelik / Kullanım Sözleşmesi"
                required
              />
            </div>
            <div>
              <label htmlFor="contract-version" className="block text-sm font-medium text-slate-700 mb-1">
                Versiyon
              </label>
              <Input
                id="contract-version"
                type="number"
                min={1}
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                disabled={!isCreate}
                title={isCreate ? undefined : "Mevcut versiyonun numarası değiştirilemez"}
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label htmlFor="contract-content" className="block text-sm font-medium text-slate-700">
                İçerik (Markdown) *
              </label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setPreview((p) => !p)}
              >
                {preview ? (
                  <>
                    <Code className="w-4 h-4 mr-1" /> Düzenle
                  </>
                ) : (
                  <>
                    <Eye className="w-4 h-4 mr-1" /> Önizleme
                  </>
                )}
              </Button>
            </div>
            {preview ? (
              <div className="min-h-64 max-h-80 overflow-y-auto rounded-md border border-slate-200 p-4 prose prose-sm prose-slate max-w-none">
                <ReactMarkdown>{content || "_(içerik boş)_"}</ReactMarkdown>
              </div>
            ) : (
              <textarea
                id="contract-content"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={14}
                required
                className="w-full rounded-md border border-slate-200 p-3 text-sm font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                placeholder="# Başlık&#10;&#10;Sözleşme metni…"
              />
            )}
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            Bu versiyonu aktif yap (kullanıcılara bu metin gösterilir)
          </label>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={saveMutation.isPending}>
              Vazgeç
            </Button>
            <Button type="submit" disabled={saveMutation.isPending} className="bg-indigo-600 hover:bg-indigo-700">
              {saveMutation.isPending ? "Kaydediliyor..." : isCreate ? "Oluştur" : "Kaydet"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
