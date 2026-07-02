import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api/apiClient';
import { toast } from 'sonner';
import {
  Activity,
  Mail,
  CheckCircle2,
  AlertTriangle,
  TrendingUp,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import * as AlertDialog from '@radix-ui/react-alert-dialog';

function MetricCard({ icon: Icon, label, value, unit = null, color = 'indigo' }) {
  const colorMap = {
    indigo: 'bg-indigo-50 text-indigo-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    rose: 'bg-rose-50 text-rose-600',
    amber: 'bg-amber-50 text-amber-600',
    violet: 'bg-violet-50 text-violet-600',
    sky: 'bg-sky-50 text-sky-600',
  };

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-2">
      <div className="flex items-center justify-between">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${colorMap[color]}`}>
          <Icon className="w-5 h-5" />
        </div>
        <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</p>
      </div>
      <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
        {typeof value === 'number' ? value.toLocaleString('tr-TR') : value}
      </p>
      {unit && <p className="text-xs text-gray-400 dark:text-gray-500">{unit}</p>}
    </div>
  );
}

function QueueBar({ queue, count, max }) {
  const percentage = max > 0 ? (count / max) * 100 : 0;
  const colors = {
    CRITICAL: { bar: 'bg-red-500', bg: 'bg-red-50 dark:bg-red-900/20', label: 'text-red-700 dark:text-red-400' },
    NOTIFY: { bar: 'bg-amber-500', bg: 'bg-amber-50 dark:bg-amber-900/20', label: 'text-amber-700 dark:text-amber-400' },
    BULK: { bar: 'bg-blue-500', bg: 'bg-blue-50 dark:bg-blue-900/20', label: 'text-blue-700 dark:text-blue-400' },
  };

  const color = colors[queue] || colors.BULK;

  return (
    <div className={`p-4 rounded-lg border border-gray-200 dark:border-gray-700 ${color.bg}`}>
      <div className="flex items-center justify-between mb-2">
        <span className={`text-sm font-semibold ${color.label}`}>{queue}</span>
        <span className={`text-xs ${color.label}`}>
          {count} / {max}
        </span>
      </div>
      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
        <div
          className={`h-full ${color.bar} transition-all duration-300`}
          style={{ width: `${Math.min(percentage, 100)}%` }}
        />
      </div>
    </div>
  );
}

export default function EmailDashboard() {
  const queryClient = useQueryClient();
  const [confirmDialog, setConfirmDialog] = useState(null);
  const [reason, setReason] = useState('');

  const { data: metrics, isLoading } = useQuery({
    queryKey: ['email', 'dashboard'],
    queryFn: async () => {
      const { data } = await api.get('/admin/email/dashboard');
      return data;
    },
    refetchInterval: 30_000,
  });

  const toggleMutation = useMutation({
    mutationFn: async (/** @type {any} */ body) => {
      const { data } = await api.patch('/admin/email/kill-switches', body);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email', 'dashboard'] });
      toast.success('Ayar güncellendi');
      setConfirmDialog(null);
      setReason('');
    },
    onError: (error) => {
      toast.error(error.response?.data?.message || 'Güncellenemedi');
    },
  });

  const handleClearAutoPause = () => {
    setConfirmDialog('clear-auto-pause');
  };

  const confirmClearAutoPause = () => {
    if (!reason.trim() || reason.trim().length < 3) {
      toast.error('Sebep en az 3 karakter olmalı');
      return;
    }
    toggleMutation.mutate({
      clearAutoPause: true,
      reason: reason.trim(),
      emailEducatorBulkEnabled: true,
      emailCandidateBulkEnabled: true,
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-10 w-64 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-24 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const counts24h = metrics?.counts24h || {};
  const counts7d = metrics?.counts7d || {};
  const queueDepth = metrics?.queueDepth || { CRITICAL: 0, NOTIFY: 0, BULK: 0 };
  const autoPaused = metrics?.autoPaused;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center">
          <Mail className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Email Paneli</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Email trafiği metrikleri ve durumu</p>
        </div>
      </div>

      {/* Auto-pause alert */}
      {autoPaused?.active && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg space-y-3">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-red-700 dark:text-red-300">Toplu Emailler Otomatik Durduruldu</p>
              <p className="text-sm text-red-600 dark:text-red-400 mt-1">
                Sebep: {autoPaused.reason}
              </p>
              <p className="text-xs text-red-500 dark:text-red-500 mt-1">
                {new Date(autoPaused.at).toLocaleString('tr-TR')}
              </p>
            </div>
          </div>
          <button
            onClick={handleClearAutoPause}
            className="px-3 py-2 bg-red-600 hover:bg-red-700 dark:bg-red-600 dark:hover:bg-red-700 text-white text-sm font-medium rounded transition-colors"
          >
            Manuel Devam Ettir
          </button>
        </div>
      )}

      {/* 6 metric cards — 24h */}
      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Son 24 Saat</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <MetricCard
            icon={Mail}
            label="Sıraya Alınan"
            value={counts24h.queued ?? 0}
            color="indigo"
          />
          <MetricCard
            icon={CheckCircle2}
            label="Gönderilen"
            value={counts24h.sent ?? 0}
            color="emerald"
          />
          <MetricCard
            icon={Activity}
            label="Teslimat Yapılan"
            value={counts24h.delivered ?? 0}
            color="violet"
          />
          <MetricCard
            icon={AlertCircle}
            label="Geri Dönen"
            value={counts24h.bounced ?? 0}
            color="rose"
          />
          <MetricCard
            icon={AlertTriangle}
            label="Şikayet"
            value={counts24h.complained ?? 0}
            color="amber"
          />
          <MetricCard
            icon={TrendingUp}
            label="Geri Dönüş Oranı"
            value={`${metrics?.bounceRate24h ?? 0}%`}
            color="sky"
          />
        </div>
      </div>

      {/* Queue depth */}
      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Kuyruk Durumu</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <QueueBar queue="CRITICAL" count={queueDepth.CRITICAL || 0} max={1000} />
          <QueueBar queue="NOTIFY" count={queueDepth.NOTIFY || 0} max={5000} />
          <QueueBar queue="BULK" count={queueDepth.BULK || 0} max={10000} />
        </div>
      </div>

      {/* Provider health */}
      {metrics?.providers && metrics.providers.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Sağlayıcı Sağlığı</h2>
          <div className="space-y-2">
            {metrics.providers.map((provider) => (
              <div
                key={provider.id}
                className="p-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg flex items-center justify-between"
              >
                <div>
                  <p className="font-medium text-gray-900 dark:text-gray-100">{provider.name}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {provider.kind} • Son başarı: {provider.lastSuccessAt
                      ? new Date(provider.lastSuccessAt).toLocaleString('tr-TR')
                      : 'Henüz yok'}
                  </p>
                </div>
                {provider.isActive ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-gray-400 dark:text-gray-600" />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Template performance */}
      {metrics?.templatePerformance && metrics.templatePerformance.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Şablon Performansı</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-400">Şablon</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-600 dark:text-gray-400">Gönderilen</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-600 dark:text-gray-400">Teslimat %</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-600 dark:text-gray-400">Geri Dönüş %</th>
                </tr>
              </thead>
              <tbody>
                {metrics.templatePerformance.map((t) => (
                  <tr key={t.templateKey} className="border-b border-gray-100 dark:border-gray-700">
                    <td className="px-3 py-2 text-gray-900 dark:text-gray-100">{t.templateKey}</td>
                    <td className="px-3 py-2 text-right text-gray-600 dark:text-gray-400">{t.sent.toLocaleString('tr-TR')}</td>
                    <td className="px-3 py-2 text-right">
                      <span className={t.deliveryRate >= 95 ? 'text-emerald-600 dark:text-emerald-400 font-medium' : 'text-amber-600 dark:text-amber-400'}>
                        {t.deliveryRate}%
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <span className={t.bounceRate < 5 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400 font-medium'}>
                        {t.bounceRate}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Confirm clear auto-pause dialog */}
      <AlertDialog.Root open={confirmDialog === 'clear-auto-pause'} onOpenChange={() => setConfirmDialog(null)}>
        <AlertDialog.Content className="max-w-md bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6 space-y-4">
          <AlertDialog.Title className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Toplu Emailleri Devam Ettir
          </AlertDialog.Title>
          <AlertDialog.Description className="text-sm text-gray-600 dark:text-gray-400">
            Toplu email kuyruğunu yeniden etkinleştirmek için bir sebep girin.
          </AlertDialog.Description>

          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Örn: Bakım tamamlandı, sistem stabilleşti"
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            rows={3}
          />

          <div className="flex gap-2 justify-end">
            <AlertDialog.Cancel className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
              İptal
            </AlertDialog.Cancel>
            <button
              onClick={confirmClearAutoPause}
              disabled={toggleMutation.isPending || !reason.trim() || reason.trim().length < 3}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-600 dark:hover:bg-indigo-700 text-white rounded-lg disabled:opacity-50 transition-colors flex items-center gap-2"
            >
              {toggleMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              Devam Ettir
            </button>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Root>
    </div>
  );
}
