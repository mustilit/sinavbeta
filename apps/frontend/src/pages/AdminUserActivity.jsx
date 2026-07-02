import { useState, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { adminUsers, adminAudit } from "@/api/dalClient";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Search, History, User as UserIcon, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { tr } from "date-fns/locale";

/**
 * AdminUserActivity — admin tarafından kullanıcı işlem geçmişi görüntüleme.
 *
 * Akış:
 *   1) Admin email/kullanıcı adı + (opsiyonel) tarih aralığı girer.
 *   2) Önce GET /admin/users?q=... ile kullanıcı bulunur.
 *   3) Bulunan user.id ile GET /admin/audit?actorId=...&from=...&to=... çağrılır.
 *   4) AuditLog kayıtları tabloda listelenir (action, entityType, entityId, timestamp, metadata).
 *
 * Rol farkı yok: aday/eğitici/admin/worker hepsinin actorId'si audit log'da aranır.
 */

const ROLE_LABEL_TR = {
  CANDIDATE: "Aday",
  EDUCATOR: "Eğitici",
  ADMIN: "Yönetici",
  WORKER: "Çalışan",
};

// Backend AuditAction enum'una göre gruplu liste — Radix Select.Group ile
// kategori başlıkları altında listelenir. Backend prisma/schema.prisma:75
// AuditAction enum ile senkron tutulmalı.
const ACTION_GROUPS = [
  {
    label: "Test İşlemleri",
    actions: [
      { value: "SUBMIT_ATTEMPT", label: "Test bitirme" },
      { value: "SUBMIT_ANSWER", label: "Cevap gönderme" },
      { value: "TEST_PUBLISHED", label: "Test yayımlama" },
      { value: "TEST_UNPUBLISHED", label: "Test yayından kaldırma" },
      { value: "PRICE_CHANGED", label: "Fiyat değişikliği" },
    ],
  },
  {
    label: "Tünel & Yazılı İşlemleri",
    actions: [
      { value: "TUNNEL_SUBMITTED", label: "Tünel onaya gönderme" },
      { value: "TUNNEL_APPROVED", label: "Tünel onaylama" },
      { value: "TUNNEL_REJECTED", label: "Tünel reddi" },
      { value: "TUNNEL_UPDATED", label: "Tünel güncelleme" },
      { value: "WRITTEN_PUBLISHED", label: "Yazılı yayımlama" },
      { value: "WRITTEN_UNPUBLISHED", label: "Yazılı yayından kaldırma" },
      { value: "WRITTEN_UPDATED", label: "Yazılı güncelleme" },
    ],
  },
  {
    label: "Satın Alma & İade",
    actions: [
      { value: "PURCHASE", label: "Satın alma" },
      { value: "REFUND_REQUESTED", label: "İade talebi" },
      { value: "REFUND_APPROVED", label: "İade onayı" },
      { value: "REFUND_REJECTED", label: "İade reddi" },
      { value: "REFUND_RESOLVED", label: "İade sonuçlandı" },
      { value: "DISCOUNT_CREATED", label: "İndirim kodu oluşturma" },
    ],
  },
  {
    label: "İtiraz & Değerlendirme",
    actions: [
      { value: "OBJECTION_CREATED", label: "İtiraz oluşturma" },
      { value: "OBJECTION_ANSWERED", label: "İtiraz cevaplama" },
      { value: "OBJECTION_ESCALATED", label: "İtiraz eskalasyonu" },
      { value: "REVIEW_CREATED", label: "Değerlendirme yazma" },
      { value: "REVIEW_UPSERTED", label: "Değerlendirme güncelleme" },
    ],
  },
  {
    label: "Hesap & Güvenlik",
    actions: [
      { value: "AUTH_LOGIN_SUCCESS", label: "Başarılı giriş" },
      { value: "AUTH_LOGIN_FAIL", label: "Başarısız giriş" },
      { value: "AUTH_MFA_ENABLED", label: "2FA açma" },
      { value: "AUTH_MFA_DISABLED", label: "2FA kapama" },
      { value: "AUTH_MFA_RECOVERY_USED", label: "2FA kurtarma kullanma" },
      { value: "USER_ROLE_CHANGED", label: "Rol değişikliği" },
      { value: "USER_SUSPENDED", label: "Kullanıcı askıya alma" },
      { value: "USER_DELETED", label: "Kullanıcı silme" },
      { value: "EDUCATOR_APPROVED", label: "Eğitici onayı" },
      { value: "EDUCATOR_SUSPENDED", label: "Eğitici askıya alma" },
      { value: "EDUCATOR_UNSUSPENDED", label: "Eğitici aktifleştirme" },
      { value: "EDUCATOR_PROFILE_UPDATED", label: "Eğitici profil güncelleme" },
    ],
  },
  {
    label: "Email",
    actions: [
      { value: "EMAIL_SENT", label: "Email gönderildi" },
      { value: "EMAIL_FAILED", label: "Email başarısız" },
      { value: "EMAIL_PROVIDER_CREATED", label: "Email sağlayıcı oluşturma" },
      { value: "EMAIL_PROVIDER_UPDATED", label: "Email sağlayıcı güncelleme" },
      { value: "EMAIL_PROVIDER_DELETED", label: "Email sağlayıcı silme" },
      { value: "EMAIL_PROVIDER_TESTED", label: "Email sağlayıcı testi" },
      { value: "EMAIL_KILL_SWITCH_CHANGED", label: "Email kill switch" },
      { value: "EMAIL_SUPPRESSION_ADDED", label: "Email engelleme ekleme" },
      { value: "EMAIL_SUPPRESSION_REMOVED", label: "Email engelleme kaldırma" },
      { value: "EMAIL_TEMPLATE_UPDATED", label: "Email şablon güncelleme" },
      { value: "EMAIL_RETRY_TRIGGERED", label: "Email yeniden gönderme" },
      { value: "EMAIL_PREFERENCES_UPDATED", label: "Email tercihleri güncelleme" },
      { value: "EMAIL_UNSUBSCRIBE", label: "Email abonelikten çıkma" },
      { value: "NOTIFICATIONS_DISABLED", label: "Bildirim devre dışı" },
    ],
  },
  {
    label: "Sistem & Yönetici",
    actions: [
      { value: "ADMIN_SETTINGS_UPDATED", label: "Admin ayarları güncelleme" },
      { value: "EXAMTYPE_CREATED", label: "Sınav türü oluşturma" },
      { value: "EXAMTYPE_UPDATED", label: "Sınav türü güncelleme" },
      { value: "EXAMTYPE_DELETED", label: "Sınav türü silme" },
      { value: "TOPIC_CREATED", label: "Konu oluşturma" },
      { value: "TOPIC_UPDATED", label: "Konu güncelleme" },
      { value: "TOPIC_DELETED", label: "Konu silme" },
      { value: "BACKUP_RUN", label: "Yedekleme çalıştırma" },
      { value: "PAYOUT_PROCESSED", label: "Ödeme işleme" },
      { value: "CONTRACT_ACCEPTED", label: "Sözleşme kabulü" },
      { value: "SUBSCRIPTION_CREATED", label: "Abonelik oluşturma" },
      { value: "SUBSCRIPTION_UPDATED", label: "Abonelik güncelleme" },
      { value: "SUBSCRIPTION_CANCELED", label: "Abonelik iptali" },
      { value: "WEBHOOK_RECEIVED", label: "Webhook alındı" },
      { value: "WEBHOOK_REJECTED", label: "Webhook reddedildi" },
      { value: "CSP_VIOLATION", label: "CSP ihlali" },
      { value: "SUSPICIOUS_RATE_LIMIT", label: "Şüpheli istek limiti" },
    ],
  },
];

/** İşlem koduna karşılık gelen Türkçe label'ı bulur (tablo için kısa metin). */
function actionLabelTR(action) {
  for (const grp of ACTION_GROUPS) {
    const found = grp.actions.find((a) => a.value === action);
    if (found) return found.label;
  }
  return action;
}

function safeFmt(ts) {
  if (!ts) return "—";
  try {
    return format(new Date(ts), "d MMM yyyy HH:mm:ss", { locale: tr });
  } catch {
    return String(ts);
  }
}

function MetadataPreview({ metadata }) {
  if (metadata == null) return <span className="text-slate-400">—</span>;
  let text;
  try {
    text = typeof metadata === "string" ? metadata : JSON.stringify(metadata);
  } catch {
    text = "[parse error]";
  }
  if (text.length > 120) text = text.slice(0, 120) + "…";
  return (
    <code className="text-xs text-slate-600 break-all">{text}</code>
  );
}

export default function AdminUserActivity() {
  const [query, setQuery] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  // İki kademeli işlem tipi filtresi:
  //   actionGroup  = 'all' veya grup başlığı (örn. "Test İşlemleri")
  //   actionFilter = 'all' (grup içinde tümü) veya tek bir AuditAction değeri
  // Grup değişince işlem filtresi 'all'a sıfırlanır.
  const [actionGroup, setActionGroup] = useState("all");
  const [actionFilter, setActionFilter] = useState("all");

  const [foundUser, setFoundUser] = useState(null);
  const [logs, setLogs] = useState(null);
  const [searchParams] = useSearchParams();

  const searchMut = useMutation({
    mutationFn: async (/** @type {any} */ overrideQ) => {
      // overrideQ: deep-link (?q=) ile gelen sorgu; yoksa input state'i
      const q = (typeof overrideQ === "string" ? overrideQ : query).trim();
      if (!q) throw new Error("Kullanıcı adı veya email gerekli");

      // 1) User lookup
      const users = await adminUsers.search({ q, limit: 5 });
      if (!Array.isArray(users) || users.length === 0) {
        throw new Error("Kullanıcı bulunamadı");
      }
      const user = users[0]; // ilk eşleşmeyi al

      // 2) Audit logs
      const fromIso = from ? new Date(from).toISOString() : undefined;
      // 'to' alanında günü gün sonuna kadar dahil et
      let toIso;
      if (to) {
        const d = new Date(to);
        d.setHours(23, 59, 59, 999);
        toIso = d.toISOString();
      }
      // Action filtreleme stratejisi:
      // - Belirli action seçili → o tek action backend'e gider
      // - Grup seçili ama action='all' → tüm aksiyonları çekip client-side
      //   filter et (backend bulk action filter desteklemiyor; tek değer veya yok).
      // - Grup='all' → filtre yok, hepsi gelir
      const data = await adminAudit.list({
        actorId: user.id,
        from: fromIso,
        to: toIso,
        action: actionFilter !== "all" ? actionFilter : undefined,
        page: 1,
        limit: 200,
      });
      let items = Array.isArray(data) ? data : (data?.items ?? data?.logs ?? []);

      // Client-side grup filtresi: grup seçili + action='all' ise, sadece
      // o grubun action'larını içeren log'ları göster. Backend tek action
      // alıyor — bulk filtering burada yapılır.
      if (actionGroup !== "all" && actionFilter === "all") {
        const grp = ACTION_GROUPS.find((g) => g.label === actionGroup);
        if (grp) {
          const allowed = new Set(grp.actions.map((a) => a.value));
          items = items.filter((log) => allowed.has(log.action));
        }
      }

      return { user, items, total: data?.total ?? items.length };
    },
    onSuccess: (data) => {
      setFoundUser(data.user);
      setLogs(data.items);
      if (data.items.length === 0) {
        toast.info("Bu kullanıcı için kayıt bulunamadı");
      } else {
        toast.success(`${data.items.length} kayıt bulundu`);
      }
    },
    onError: (e) => {
      setFoundUser(null);
      setLogs(null);
      toast.error(e?.message ?? "Arama başarısız");
    },
  });

  const handleSubmit = (e) => {
    e?.preventDefault();
    searchMut.mutate();
  };

  // Deep-link: ManageUsers vb. sayfalardan ?q=<email|username> ile gelince
  // arama otomatik koşar (kullanıcının tüm işlem geçmişine tek tıkla geçiş).
  useEffect(() => {
    const q = searchParams.get("q");
    if (q && q.trim()) {
      setQuery(q.trim());
      searchMut.mutate(q.trim());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center">
          <History className="w-5 h-5 text-indigo-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">İşlem Geçmişi</h1>
          <p className="text-sm text-slate-500">
            Aday veya eğitici hesabının audit log kayıtlarını görüntüle
          </p>
        </div>
      </div>

      {/* Search form */}
      <form
        onSubmit={handleSubmit}
        className="bg-white border border-slate-200 rounded-xl p-5 space-y-4"
      >
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-4">
          <div className="sm:col-span-5">
            <Label className="text-xs mb-1 block">Kullanıcı adı veya email</Label>
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ör. aday@demo.com veya demo_egitici"
              className="h-9"
              autoFocus
            />
          </div>
          <div>
            <Label className="text-xs mb-1 block">Başlangıç tarihi</Label>
            <Input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="h-9"
            />
          </div>
          <div>
            <Label className="text-xs mb-1 block">Bitiş tarihi</Label>
            <Input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="h-9"
            />
          </div>
          {/* Kategori seçimi — ikinci dropdown'ı (İşlem) doldurur */}
          <div>
            <Label className="text-xs mb-1 block">İşlem Kategorisi</Label>
            <Select
              value={actionGroup}
              onValueChange={(v) => {
                setActionGroup(v);
                setActionFilter("all"); // grup değişince işlem sıfırla
              }}
            >
              <SelectTrigger className="h-9" aria-label="İşlem kategorisi filtresi">
                <SelectValue placeholder="Tümü" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tümü</SelectItem>
                {ACTION_GROUPS.map((grp) => (
                  <SelectItem key={grp.label} value={grp.label}>
                    {grp.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {/* İşlem seçimi — kategori seçili değilse pasif */}
          <div>
            <Label className="text-xs mb-1 block">İşlem</Label>
            <Select
              value={actionFilter}
              onValueChange={setActionFilter}
              disabled={actionGroup === "all"}
            >
              <SelectTrigger className="h-9" aria-label="İşlem tipi filtresi">
                <SelectValue placeholder={actionGroup === "all" ? "Önce kategori seç" : "Tümü"} />
              </SelectTrigger>
              <SelectContent className="max-h-80">
                <SelectItem value="all">Tümü</SelectItem>
                {ACTION_GROUPS
                  .find((g) => g.label === actionGroup)
                  ?.actions.map((act) => (
                    <SelectItem key={act.value} value={act.value}>
                      {act.label}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end sm:col-span-5">
            <Button
              type="submit"
              className="w-full sm:w-auto sm:ml-auto h-9 px-6 bg-indigo-600 hover:bg-indigo-700"
              disabled={searchMut.isPending || !query.trim()}
            >
              <Search className="w-4 h-4 mr-1.5" />
              {searchMut.isPending ? "Aranıyor…" : "Geçmişi Getir"}
            </Button>
          </div>
        </div>
      </form>

      {/* User info */}
      {foundUser && (
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-start gap-3 flex-wrap">
            <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
              <UserIcon className="w-5 h-5 text-slate-500" />
            </div>
            <div className="flex-1 min-w-[200px]">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-semibold text-slate-900">
                  {foundUser.name || foundUser.username || foundUser.email}
                </p>
                <Badge variant="outline" className="text-xs">
                  {ROLE_LABEL_TR[foundUser.role] ?? foundUser.role ?? "—"}
                </Badge>
              </div>
              <p className="text-sm text-slate-500">{foundUser.email}</p>
              <p className="text-xs text-slate-400 mt-1">ID: <code>{foundUser.id}</code></p>
            </div>
          </div>
        </div>
      )}

      {/* Results */}
      {logs !== null && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
            <h2 className="font-semibold text-slate-800 text-sm">
              İşlem Kayıtları
              <span className="ml-2 text-xs font-normal text-slate-500">({logs.length})</span>
            </h2>
          </div>

          {logs.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <AlertCircle className="w-8 h-8 mx-auto mb-2 text-slate-300" />
              <p>Bu kullanıcı için seçilen aralıkta kayıt bulunamadı.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-600 text-xs">
                  <tr>
                    <th className="px-3 py-2 text-left">Tarih</th>
                    <th className="px-3 py-2 text-left">Eylem</th>
                    <th className="px-3 py-2 text-left">Varlık Tipi</th>
                    <th className="px-3 py-2 text-left">Varlık ID</th>
                    <th className="px-3 py-2 text-left">Detay</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log, idx) => (
                    <tr
                      key={log.id ?? idx}
                      className="border-t border-slate-100 hover:bg-slate-50"
                    >
                      <td className="px-3 py-2 text-slate-700 whitespace-nowrap">
                        {safeFmt(log.createdAt ?? log.timestamp ?? log.created_at)}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <code className="text-xs bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded">
                          {log.action ?? "—"}
                        </code>
                        {log.action && (
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            {actionLabelTR(log.action)}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-slate-600">{log.entityType ?? "—"}</td>
                      <td className="px-3 py-2 max-w-[260px]">
                        {/* Anlamlı varlık etiketi: backend ListAuditLogs enrich eder.
                            - entityLabel + entityLink → Link bileşeniyle tıklanabilir
                            - entityLabel sadece → düz metin
                            - hiçbiri yok → kısa UUID fallback */}
                        {log.entityLabel ? (
                          log.entityLink ? (
                            <Link
                              to={log.entityLink}
                              className="text-indigo-600 hover:text-indigo-800 hover:underline text-sm break-words"
                            >
                              {log.entityLabel}
                            </Link>
                          ) : (
                            <span className="text-slate-700 text-sm break-words">
                              {log.entityLabel}
                            </span>
                          )
                        ) : log.entityId ? (
                          <code className="text-xs text-slate-400">
                            {String(log.entityId).slice(0, 8)}…
                          </code>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 max-w-[300px]">
                        <MetadataPreview metadata={log.metadata} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
