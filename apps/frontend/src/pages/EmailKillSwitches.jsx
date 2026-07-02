import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api/apiClient';
import { toast } from 'sonner';
import {
  AlertTriangle,
  Info,
  Loader2,
  HelpCircle,
  Clock,
} from 'lucide-react';
import * as AlertDialog from '@radix-ui/react-alert-dialog';
import * as Tooltip from '@radix-ui/react-tooltip';

const QUEUE_LABELS = {
  CRITICAL: 'Kritik',
  NOTIFY: 'Bildirim',
  BULK: 'Toplu',
};

const ROLE_NAMES = {
  educator: 'Eğitici',
  candidate: 'Aday',
  staff: 'Admin/Çalışan',
};

const MATRIX_CONFIG = [
  { role: 'educator', label: ROLE_NAMES.educator },
  { role: 'candidate', label: ROLE_NAMES.candidate },
  { role: 'staff', label: ROLE_NAMES.staff },
];

const QUEUE_CONFIG = [
  {
    queue: 'CRITICAL',
    key: 'Critical',
    description: 'Hesap doğrulama, şifre sıfırlama, ödeme bildirimleri',
  },
  {
    queue: 'NOTIFY',
    key: 'Notify',
    description: 'İtiraz güncellemeleri, iade durumu, canlı sınav davetleri',
  },
  {
    queue: 'BULK',
    key: 'Bulk',
    description: 'Pazarlama, haftalık özet, yeni özellik duyuruları',
  },
];

function SwitchCell({
  flagName,
  isEnabled,
  onToggle,
  disabled,
  tooltip,
  isAdmin,
}) {
  if (isAdmin && flagName.includes('Bulk')) {
    return <td className="px-4 py-3 text-center text-gray-400 dark:text-gray-600">—</td>;
  }

  return (
    <td className="px-4 py-3 text-center">
      <Tooltip.Provider>
        <Tooltip.Root>
          <Tooltip.Trigger asChild>
            <button
              onClick={() => onToggle(flagName, !isEnabled)}
              disabled={disabled}
              className={`relative inline-flex h-7 w-14 rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900 ${
                isEnabled
                  ? 'bg-emerald-600 dark:bg-emerald-600'
                  : 'bg-gray-300 dark:bg-gray-600'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
              aria-label={`${flagName} toggle`}
            >
              <span
                className={`inline-block h-6 w-6 rounded-full bg-white shadow transition-transform ${
                  isEnabled ? 'translate-x-7' : 'translate-x-0'
                }`}
              />
            </button>
          </Tooltip.Trigger>
          {tooltip && (
            <Tooltip.Content
              className="bg-gray-900 dark:bg-gray-800 text-white text-xs px-2 py-1 rounded max-w-xs"
              side="top"
            >
              {tooltip}
            </Tooltip.Content>
          )}
        </Tooltip.Root>
      </Tooltip.Provider>
    </td>
  );
}

export default function EmailKillSwitches() {
  const queryClient = useQueryClient();
  const [confirmDialog, setConfirmDialog] = useState(null);
  const [pendingChange, setPendingChange] = useState(null);
  const [reason, setReason] = useState('');

  const { data: settings, isLoading } = useQuery({
    queryKey: ['admin', 'email-settings'],
    queryFn: async () => {
      const { data } = await api.get('/admin/email/kill-switches');
      return data;
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async (/** @type {any} */ body) => {
      const { data } = await api.patch('/admin/email/kill-switches', body);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'email-settings'] });
      queryClient.invalidateQueries({ queryKey: ['email', 'dashboard'] });
      toast.success('Ayar güncellendi');
      setConfirmDialog(null);
      setPendingChange(null);
      setReason('');
    },
    onError: (error) => {
      toast.error(error.response?.data?.message || 'Güncellenemedi');
    },
  });

  const handleToggle = (flagName, newValue) => {
    setPendingChange({ flagName, newValue });
    setReason('');
    setConfirmDialog('confirm-change');
  };

  const confirmChange = () => {
    if (!reason.trim() || reason.trim().length < 3) {
      toast.error('Sebep en az 3 karakter olmalı');
      return;
    }

    const body = {
      [pendingChange.flagName]: pendingChange.newValue,
      reason: reason.trim(),
    };

    toggleMutation.mutate(body);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400 dark:text-gray-600" />
      </div>
    );
  }

  const emailEnabled = settings?.emailEnabled !== false;
  const autoPaused = settings?.emailBulkAutoPausedAt;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-red-50 dark:bg-red-900/30 flex items-center justify-center">
          <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Email Kill-Switch'ler</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Email kanallarını koşullu olarak kapat veya aç
          </p>
        </div>
      </div>

      {/* Global email status */}
      <div
        className={`p-4 rounded-lg border-2 transition-all ${
          emailEnabled
            ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20'
            : 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20'
        }`}
      >
        <div className="flex items-center justify-between">
          <div>
            <p className={`font-semibold ${emailEnabled ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300'}`}>
              {emailEnabled ? '✓ Tüm Emailler Aktif' : '✕ TÜM EMAİLLER DURDURULDU'}
            </p>
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
              {emailEnabled
                ? 'Email sistemi normal olarak çalışıyor'
                : 'Tüm email gönderimi durdurulmuştur'}
            </p>
          </div>
          <button
            onClick={() => handleToggle('emailEnabled', !emailEnabled)}
            className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
              emailEnabled
                ? 'bg-red-600 hover:bg-red-700 dark:bg-red-600 dark:hover:bg-red-700 text-white'
                : 'bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-700 text-white'
            }`}
          >
            {emailEnabled ? 'Tümünü Durdur' : 'Tümünü Aç'}
          </button>
        </div>
      </div>

      {/* Auto-pause warning */}
      {autoPaused && (
        <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
          <p className="font-semibold text-amber-700 dark:text-amber-300 mb-2">
            Toplu Emailler Otomatik Durduruldu
          </p>
          <p className="text-sm text-amber-600 dark:text-amber-400 mb-3">
            Sebep: {settings?.emailBulkAutoPausedReason}
          </p>
          <p className="text-xs text-amber-600 dark:text-amber-500 mb-3">
            {new Date(autoPaused).toLocaleString('tr-TR')}
          </p>
          <button
            onClick={() => handleToggle('clearAutoPause', true)}
            className="px-3 py-2 bg-amber-600 hover:bg-amber-700 dark:bg-amber-600 dark:hover:bg-amber-700 text-white text-sm font-medium rounded transition-colors"
          >
            Manuel Devam Ettir
          </button>
        </div>
      )}

      {/* Info */}
      <div className="flex items-start gap-3 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
        <Info className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-blue-700 dark:text-blue-300 space-y-1">
          <p>
            <strong>Nasıl çalışır?</strong> Her email kategorisini satır/sütun kombinasyonuyla kontrol edin.
            Bir kategoriyi kapattığınızda, bu kategoriye ait tüm emailler gönderilmez.
          </p>
          <p>
            Kritik ve Bildirim kategorileri gerekçeli kapatılabilir. Toplu emailler otomatik yönetilir.
          </p>
        </div>
      </div>

      {/* Matrix table */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse bg-white dark:bg-gray-800 rounded-lg overflow-hidden shadow-sm">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700">
              <th className="px-4 py-3 text-left font-semibold text-gray-900 dark:text-gray-100 text-sm">Rol / Kategori</th>
              {QUEUE_CONFIG.map((q) => (
                <th key={q.queue} className="px-4 py-3 text-center font-semibold text-gray-900 dark:text-gray-100 text-sm">
                  <div className="flex items-center justify-center gap-1">
                    <span>{QUEUE_LABELS[q.queue]}</span>
                    <Tooltip.Provider>
                      <Tooltip.Root>
                        <Tooltip.Trigger asChild>
                          <button className="text-gray-400 dark:text-gray-600 hover:text-gray-600 dark:hover:text-gray-400">
                            <HelpCircle className="w-4 h-4" />
                          </button>
                        </Tooltip.Trigger>
                        <Tooltip.Content
                          className="bg-gray-900 dark:bg-gray-800 text-white text-xs px-2 py-1 rounded max-w-xs"
                          side="top"
                        >
                          {q.description}
                        </Tooltip.Content>
                      </Tooltip.Root>
                    </Tooltip.Provider>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {MATRIX_CONFIG.map((role) => (
              <tr key={role.role} className="border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">{role.label}</td>
                {QUEUE_CONFIG.map((queue) => {
                  const flagName = `email${role.role.charAt(0).toUpperCase() + role.role.slice(1)}${queue.key}Enabled`;
                  const isEnabled = settings?.[flagName] !== false;
                  const isSaving = toggleMutation.isPending && pendingChange?.flagName === flagName;

                  return (
                    <SwitchCell
                      key={`${role.role}-${queue.queue}`}
                      flagName={flagName}
                      isEnabled={isEnabled}
                      onToggle={handleToggle}
                      disabled={isSaving}
                      tooltip={`${role.label} için ${QUEUE_LABELS[queue.queue]} emailleri`}
                      isAdmin={role.role === 'staff'}
                    />
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="text-xs text-gray-500 dark:text-gray-400 space-y-1">
        <p>
          <strong>Yeşil:</strong> Açık (emailler gönderiliyor)
        </p>
        <p>
          <strong>Gri:</strong> Kapalı (emailler gönderilmiyor)
        </p>
        <p>
          <strong>—:</strong> Bu kategori bu rol için uygulanmıyor
        </p>
      </div>

      {/* Gönderim saat penceresi */}
      <SendWindowCard settings={settings} onSaved={() => queryClient.invalidateQueries({ queryKey: ['admin', 'email-settings'] })} />


      {/* Confirm change dialog */}
      <AlertDialog.Root open={confirmDialog === 'confirm-change'} onOpenChange={() => setConfirmDialog(null)}>
        <AlertDialog.Content className="max-w-md bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6 space-y-4">
          <AlertDialog.Title className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Ayarı Değiştir
          </AlertDialog.Title>
          <AlertDialog.Description className="text-sm text-gray-600 dark:text-gray-400">
            Bu değişikliğin nedenini açıklayan bir not girin. Minimum 3 karakter.
          </AlertDialog.Description>

          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Örn: Servis bakımı, konfigürasyon testi"
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            rows={3}
          />

          <div className="flex gap-2 justify-end">
            <AlertDialog.Cancel className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
              İptal
            </AlertDialog.Cancel>
            <button
              onClick={confirmChange}
              disabled={toggleMutation.isPending || !reason.trim() || reason.trim().length < 3}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-600 dark:hover:bg-indigo-700 text-white rounded-lg disabled:opacity-50 transition-colors flex items-center gap-2"
            >
              {toggleMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              Onayla
            </button>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Root>
    </div>
  );
}

function SendWindowCard({ settings, onSaved }) {
  const [enabled, setEnabled] = useState(!!settings?.emailSendWindowEnabled);
  const [startHour, setStartHour] = useState(settings?.emailSendWindowStartHour ?? 9);
  const [endHour, setEndHour] = useState(settings?.emailSendWindowEndHour ?? 21);
  const [timezone, setTimezone] = useState(settings?.emailSendWindowTimezone ?? 'Europe/Istanbul');
  const [appliesToCritical, setAppliesToCritical] = useState(
    !!settings?.emailSendWindowAppliesToCritical,
  );
  const [reason, setReason] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!settings) return;
    setEnabled(!!settings.emailSendWindowEnabled);
    setStartHour(settings.emailSendWindowStartHour ?? 9);
    setEndHour(settings.emailSendWindowEndHour ?? 21);
    setTimezone(settings.emailSendWindowTimezone ?? 'Europe/Istanbul');
    setAppliesToCritical(!!settings.emailSendWindowAppliesToCritical);
  }, [settings]);

  const isValidWindow =
    Number.isInteger(startHour) &&
    Number.isInteger(endHour) &&
    startHour >= 0 &&
    startHour <= 23 &&
    endHour >= 1 &&
    endHour <= 24 &&
    startHour < endHour;

  const hasChanges =
    enabled !== !!settings?.emailSendWindowEnabled ||
    startHour !== (settings?.emailSendWindowStartHour ?? 9) ||
    endHour !== (settings?.emailSendWindowEndHour ?? 21) ||
    timezone !== (settings?.emailSendWindowTimezone ?? 'Europe/Istanbul') ||
    appliesToCritical !== !!settings?.emailSendWindowAppliesToCritical;

  const canSave = hasChanges && isValidWindow && reason.trim().length >= 3 && !isSaving;

  const handleSave = async () => {
    if (!canSave) return;
    setIsSaving(true);
    try {
      await api.patch('/admin/email/kill-switches', {
        reason: reason.trim(),
        sendWindow: {
          emailSendWindowEnabled: enabled,
          emailSendWindowStartHour: startHour,
          emailSendWindowEndHour: endHour,
          emailSendWindowTimezone: timezone.trim(),
          emailSendWindowAppliesToCritical: appliesToCritical,
        },
      });
      toast.success('Gönderim saatleri güncellendi');
      setReason('');
      onSaved?.();
    } catch (err) {
      const e = err;
      toast.error(e?.response?.data?.message || e?.message || 'Güncellenemedi');
    } finally {
      setIsSaving(false);
    }
  };

  const fmtHour = (h) => String(h).padStart(2, '0') + ':00';

  return (
    <section
      aria-labelledby="email-send-window-heading"
      className="p-5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg space-y-4"
    >
      <header className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center flex-shrink-0">
          <Clock className="w-5 h-5 text-indigo-600 dark:text-indigo-400" aria-hidden="true" />
        </div>
        <div className="flex-1">
          <h2
            id="email-send-window-heading"
            className="text-lg font-semibold text-gray-900 dark:text-gray-100"
          >
            Gönderim Saatleri
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Mailler yalnızca seçili saat aralığında gönderilir. Aralık dışında oluşan mailler
            kuyrukta bekleyip pencere açıldığında otomatik gönderilir — kaybolmaz.
          </p>
        </div>
      </header>

      {/* Enable toggle */}
      <label
        htmlFor="send-window-enabled"
        className="flex items-center justify-between gap-3 p-3 bg-gray-50 dark:bg-gray-700/40 rounded-lg cursor-pointer"
      >
        <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
          Saat penceresini aktive et
        </span>
        <button
          id="send-window-enabled"
          type="button"
          role="switch"
          aria-checked={enabled}
          onClick={() => setEnabled((v) => !v)}
          className={`relative inline-flex h-7 w-14 rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-800 ${
            enabled ? 'bg-emerald-600' : 'bg-gray-300 dark:bg-gray-600'
          }`}
        >
          <span
            className={`inline-block h-6 w-6 rounded-full bg-white shadow transition-transform ${
              enabled ? 'translate-x-7' : 'translate-x-0'
            }`}
          />
        </button>
      </label>

      {/* Saat aralığı + TZ */}
      <div className={`grid grid-cols-1 sm:grid-cols-3 gap-4 ${enabled ? '' : 'opacity-50'}`}>
        <div>
          <label
            htmlFor="send-window-start"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
          >
            Başlangıç saati
          </label>
          <select
            id="send-window-start"
            value={startHour}
            onChange={(e) => setStartHour(Number(e.target.value))}
            disabled={!enabled}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:cursor-not-allowed"
          >
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h} value={h}>
                {fmtHour(h)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label
            htmlFor="send-window-end"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
          >
            Bitiş saati
          </label>
          <select
            id="send-window-end"
            value={endHour}
            onChange={(e) => setEndHour(Number(e.target.value))}
            disabled={!enabled}
            aria-invalid={enabled && !isValidWindow}
            aria-describedby={enabled && !isValidWindow ? 'send-window-error' : undefined}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:cursor-not-allowed"
          >
            {Array.from({ length: 24 }, (_, idx) => {
              const h = idx + 1;
              return (
                <option key={h} value={h}>
                  {h === 24 ? '24:00 (ertesi gün)' : fmtHour(h)}
                </option>
              );
            })}
          </select>
        </div>
        <div>
          <label
            htmlFor="send-window-tz"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
          >
            Saat dilimi
          </label>
          <input
            id="send-window-tz"
            type="text"
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            disabled={!enabled}
            placeholder="Europe/Istanbul"
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:cursor-not-allowed"
          />
        </div>
      </div>

      {enabled && !isValidWindow && (
        <p
          id="send-window-error"
          role="alert"
          className="text-sm text-red-600 dark:text-red-400"
        >
          Geçersiz aralık: başlangıç saati bitiş saatinden küçük olmalı (start 0-23, end 1-24).
        </p>
      )}

      {enabled && isValidWindow && (
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Pencere:{' '}
          <strong>
            {fmtHour(startHour)} – {endHour === 24 ? '24:00' : fmtHour(endHour)}
          </strong>{' '}
          ({timezone})
        </p>
      )}

      {/* Kritik dahil mi */}
      <label
        htmlFor="send-window-critical"
        className={`flex items-center justify-between gap-3 p-3 bg-gray-50 dark:bg-gray-700/40 rounded-lg cursor-pointer ${
          enabled ? '' : 'opacity-50'
        }`}
      >
        <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
          Kritik maillere de uygula
          <span className="block text-xs font-normal text-gray-500 dark:text-gray-400 mt-0.5">
            Kapalı: şifre sıfırlama / ödeme makbuzu / iade onayı pencereyi yoksayar (önerilen).
          </span>
        </span>
        <button
          id="send-window-critical"
          type="button"
          role="switch"
          aria-checked={appliesToCritical}
          onClick={() => setAppliesToCritical((v) => !v)}
          disabled={!enabled}
          className={`relative inline-flex h-7 w-14 rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-800 disabled:cursor-not-allowed ${
            appliesToCritical ? 'bg-amber-600' : 'bg-gray-300 dark:bg-gray-600'
          }`}
        >
          <span
            className={`inline-block h-6 w-6 rounded-full bg-white shadow transition-transform ${
              appliesToCritical ? 'translate-x-7' : 'translate-x-0'
            }`}
          />
        </button>
      </label>

      {/* Sebep ve kaydet */}
      <div>
        <label
          htmlFor="send-window-reason"
          className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
        >
          Değişiklik sebebi <span className="text-red-600">*</span>
        </label>
        <textarea
          id="send-window-reason"
          rows={2}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Örn: Spam şikayetlerini azaltmak için akşam mesai saatleri sınırlandı"
          aria-invalid={hasChanges && reason.trim().length < 3}
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleSave}
          disabled={!canSave}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-800"
        >
          {isSaving && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
          Kaydet
        </button>
      </div>
    </section>
  );
}
