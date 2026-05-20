import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api/apiClient';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Loader2,
  Copy,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

const EMAIL_STATUSES = {
  QUEUED: { label: 'Sırada', color: 'gray' },
  SENDING: { label: 'Gönderiliyor', color: 'blue' },
  SENT: { label: 'Gönderildi', color: 'emerald' },
  DELIVERED: { label: 'Teslim Edildi', color: 'emerald' },
  BOUNCED: { label: 'Geri Döndü', color: 'rose' },
  COMPLAINED: { label: 'Şikayet', color: 'amber' },
  FAILED: { label: 'Başarısız', color: 'rose' },
  SUPPRESSED: { label: 'Bastırıldı', color: 'slate' },
  BLOCKED_BY_PREFS: { label: 'Tercih Yok', color: 'gray' },
  BLOCKED_BY_ADMIN: { label: 'Admin Blok', color: 'red' },
  DEAD_LETTER: { label: 'Dead Letter', color: 'red' },
};

function StatusBadge({ status }) {
  const config = EMAIL_STATUSES[status] || { label: status, color: 'gray' };
  const colorMap = {
    gray: 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300',
    blue: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
    emerald: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300',
    rose: 'bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300',
    amber: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
    slate: 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300',
    red: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
  };

  return (
    <span className={`text-xs px-2 py-1 rounded-full font-medium ${colorMap[config.color]}`}>
      {config.label}
    </span>
  );
}

function Collapsible({ title, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full px-4 py-3 flex items-center justify-between bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
      >
        <span className="font-medium text-gray-900 dark:text-gray-100">{title}</span>
        {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>
      {open && <div className="p-4 space-y-2">{children}</div>}
    </div>
  );
}

export default function EmailLogDetail() {
  const [searchParams] = useSearchParams();
  const logId = searchParams.get('id');
  const queryClient = useQueryClient();

  const { data: log, isLoading } = useQuery({
    queryKey: ['email', 'logs', logId],
    queryFn: async () => {
      const { data } = await api.get(`/admin/email/logs/${logId}`);
      return data;
    },
    enabled: Boolean(logId),
  });

  const retryMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post(`/admin/email/logs/${logId}/retry`);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email', 'logs', logId] });
      toast.success('Tekrar gönderme sıraya alındı');
    },
    onError: (error) => {
      toast.error(error.response?.data?.message || 'Başarısız');
    },
  });

  if (!logId) {
    return (
      <div className="p-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
        <p className="text-red-700 dark:text-red-300">Log ID bulunamadı</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400 dark:text-gray-600" />
      </div>
    );
  }

  if (!log) {
    return (
      <div className="p-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
        <p className="text-red-700 dark:text-red-300">Log bulunamadı</p>
      </div>
    );
  }

  const canRetry = ['FAILED', 'DEAD_LETTER', 'BOUNCED'].includes(log.status);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => window.location.href = '/EmailLogs'}
          className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          aria-label="Geri"
        >
          <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-gray-400" />
        </button>
        <div className="flex-1">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Email Detayı</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{logId}</p>
        </div>
        {canRetry && (
          <button
            onClick={() => retryMutation.mutate()}
            disabled={retryMutation.isPending}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-600 dark:hover:bg-indigo-700 text-white rounded-lg disabled:opacity-50 flex items-center gap-2"
          >
            {retryMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            Tekrar Gönder
          </button>
        )}
      </div>

      {/* Top info cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg">
          <p className="text-xs text-gray-500 dark:text-gray-400 font-medium mb-1">Alıcı</p>
          <p className="font-mono text-sm text-gray-900 dark:text-gray-100 break-all">{log.recipientEmail}</p>
        </div>

        <div className="p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg">
          <p className="text-xs text-gray-500 dark:text-gray-400 font-medium mb-1">Durum</p>
          <StatusBadge status={log.status} />
        </div>

        <div className="p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg">
          <p className="text-xs text-gray-500 dark:text-gray-400 font-medium mb-1">Şablon</p>
          <p className="font-mono text-sm text-gray-900 dark:text-gray-100">{log.templateKey}</p>
        </div>
      </div>

      {/* Subject and body preview */}
      <div className="space-y-4">
        <div className="p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg">
          <p className="text-xs text-gray-500 dark:text-gray-400 font-medium mb-2">Konu</p>
          <p className="text-gray-900 dark:text-gray-100">{log.subject}</p>
        </div>

        {log.htmlBody && (
          <div className="p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg">
            <p className="text-xs text-gray-500 dark:text-gray-400 font-medium mb-2">HTML Önizlemesi</p>
            <iframe
              srcDoc={log.htmlBody}
              className="w-full h-96 border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-900"
              title="HTML Email Preview"
            />
          </div>
        )}

        {log.textBody && (
          <div className="p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg">
            <p className="text-xs text-gray-500 dark:text-gray-400 font-medium mb-2">Metin İçeriği</p>
            <pre className="bg-gray-50 dark:bg-gray-900 p-3 rounded text-xs text-gray-700 dark:text-gray-300 overflow-x-auto whitespace-pre-wrap break-words">
              {log.textBody}
            </pre>
          </div>
        )}
      </div>

      {/* Metadata */}
      <Collapsible title="Teknik Bilgiler" defaultOpen={true}>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600 dark:text-gray-400">Sağlayıcı Türü</span>
            <span className="font-mono text-sm text-gray-900 dark:text-gray-100">{log.providerKind}</span>
          </div>
          {log.providerMessageId && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600 dark:text-gray-400">Provider Message ID</span>
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm text-gray-900 dark:text-gray-100 truncate">{log.providerMessageId}</span>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(log.providerMessageId);
                    toast.success('Kopyalandı');
                  }}
                  className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                  aria-label="Kopyala"
                >
                  <Copy className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                </button>
              </div>
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600 dark:text-gray-400">Sıraya Alındığı Zaman</span>
            <span className="text-sm text-gray-900 dark:text-gray-100">
              {new Date(log.queuedAt).toLocaleString('tr-TR')}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600 dark:text-gray-400">Deneme Sayısı</span>
            <span className="font-mono text-sm text-gray-900 dark:text-gray-100">{log.attemptCount}</span>
          </div>
          {log.lastError && (
            <div>
              <span className="text-sm text-gray-600 dark:text-gray-400 block mb-1">Son Hata</span>
              <pre className="bg-red-50 dark:bg-red-900/20 p-2 rounded text-xs text-red-700 dark:text-red-300 overflow-x-auto">
                {log.lastError}
              </pre>
            </div>
          )}
        </div>
      </Collapsible>

      {/* Template data */}
      {log.templateData && (
        <Collapsible title="Şablon Verileri">
          <pre className="bg-gray-50 dark:bg-gray-900 p-3 rounded text-xs text-gray-700 dark:text-gray-300 overflow-x-auto">
            {JSON.stringify(log.templateData, null, 2)}
          </pre>
        </Collapsible>
      )}

      {/* Events timeline */}
      {log.events && log.events.length > 0 && (
        <Collapsible title={`Olaylar (${log.events.length})`} defaultOpen={true}>
          <div className="space-y-3">
            {log.events
              .sort((a, b) => new Date(b.occurredAt) - new Date(a.occurredAt))
              .map((event, idx) => (
                <div
                  key={idx}
                  className="p-3 bg-gray-50 dark:bg-gray-900 rounded border border-gray-200 dark:border-gray-700"
                >
                  <div className="flex items-start justify-between mb-1">
                    <span className="font-medium text-gray-900 dark:text-gray-100">{event.type}</span>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {new Date(event.occurredAt).toLocaleString('tr-TR')}
                    </span>
                  </div>
                  {event.meta && (
                    <pre className="text-xs text-gray-700 dark:text-gray-300 overflow-x-auto mt-2">
                      {JSON.stringify(event.meta, null, 2)}
                    </pre>
                  )}
                </div>
              ))}
          </div>
        </Collapsible>
      )}
    </div>
  );
}
