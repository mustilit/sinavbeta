import { useState, useMemo } from 'react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api/apiClient';
import { toast } from 'sonner';
import {
  Mail,
  Loader2,
  RotateCcw,
  Search,
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

const EMAIL_QUEUES = {
  CRITICAL: 'Kritik',
  NOTIFY: 'Bildirim',
  BULK: 'Toplu',
};

const USER_ROLES = {
  CANDIDATE: 'Aday',
  EDUCATOR: 'Eğitici',
  ADMIN: 'Admin',
  WORKER: 'Çalışan',
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

export default function EmailLogs() {
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState({
    queue: '',
    status: '',
    recipientRole: '',
    templateKey: '',
    emailSearch: '',
    from: '',
    to: '',
  });

  const filterParams = useMemo(() => ({
    queue: filters.queue || undefined,
    status: filters.status || undefined,
    recipientRole: filters.recipientRole || undefined,
    templateKey: filters.templateKey || undefined,
    emailSearch: filters.emailSearch || undefined,
    from: filters.from || undefined,
    to: filters.to || undefined,
  }), [filters]);

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
  } = useInfiniteQuery({
    queryKey: ['email', 'logs', filterParams],
    queryFn: async ({ pageParam }) => {
      const params = {
        ...filterParams,
        ...(pageParam?.cursorId && { cursorId: pageParam.cursorId }),
        ...(pageParam?.cursorQueuedAt && { cursorQueuedAt: pageParam.cursorQueuedAt }),
        limit: 20,
      };

      // Remove undefined values
      Object.keys(params).forEach((k) => params[k] === undefined && delete params[k]);

      const { data } = await api.get('/admin/email/logs', { params });
      return data;
    },
    initialPageParam: null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    staleTime: 30_000,
  });

  const retryMutation = useMutation({
    mutationFn: async (/** @type {any} */ logId) => {
      const { data } = await api.post(`/admin/email/logs/${logId}/retry`);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email', 'logs'] });
      toast.success('Tekrar gönderme sıraya alındı');
    },
    onError: (error) => {
      toast.error(error.response?.data?.message || 'Başarısız');
    },
  });

  const items = data?.pages.flatMap((p) => p.items) ?? [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400 dark:text-gray-600" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
        <p className="text-red-700 dark:text-red-300">Loglar yüklenemedi</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center">
          <Mail className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Email Logları</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Tüm email gönderimi kayıtları</p>
        </div>
      </div>

      {/* Filters */}
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <input
            type="text"
            placeholder="Email ara..."
            value={filters.emailSearch}
            onChange={(e) => setFilters({ ...filters, emailSearch: e.target.value })}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />

          <select
            value={filters.queue}
            onChange={(e) => setFilters({ ...filters, queue: e.target.value })}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">Tüm Kuyruklar</option>
            {Object.entries(EMAIL_QUEUES).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>

          <select
            value={filters.status}
            onChange={(e) => setFilters({ ...filters, status: e.target.value })}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">Tüm Durumlar</option>
            {Object.entries(EMAIL_STATUSES).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>

          <select
            value={filters.recipientRole}
            onChange={(e) => setFilters({ ...filters, recipientRole: e.target.value })}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">Tüm Roller</option>
            {Object.entries(USER_ROLES).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <input
            type="text"
            placeholder="Şablon adı..."
            value={filters.templateKey}
            onChange={(e) => setFilters({ ...filters, templateKey: e.target.value })}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />

          <input
            type="date"
            value={filters.from}
            onChange={(e) => setFilters({ ...filters, from: e.target.value })}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />

          <input
            type="date"
            value={filters.to}
            onChange={(e) => setFilters({ ...filters, to: e.target.value })}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      </div>

      {/* Logs table */}
      {items.length === 0 ? (
        <div className="text-center py-12">
          <Search className="w-12 h-12 text-gray-300 dark:text-gray-700 mx-auto mb-3" />
          <p className="text-gray-600 dark:text-gray-400">Sonuç bulunamadı</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((log) => (
            <div
              key={log.id}
              className="p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:border-indigo-300 dark:hover:border-indigo-700 transition-colors cursor-pointer group"
              onClick={() => window.location.href = `/EmailLogDetail?id=${log.id}`}
            >
              <div className="flex items-start justify-between gap-4 mb-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-mono text-sm text-gray-900 dark:text-gray-100 truncate">
                      {log.recipientEmail}
                    </p>
                    <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                      {USER_ROLES[log.recipientRole] || log.recipientRole}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {log.templateKey} • {EMAIL_QUEUES[log.queue]}
                  </p>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <StatusBadge status={log.status} />
                  {['FAILED', 'DEAD_LETTER', 'BOUNCED'].includes(log.status) && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        retryMutation.mutate(log.id);
                      }}
                      disabled={retryMutation.isPending}
                      className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors disabled:opacity-50"
                      aria-label="Tekrar dene"
                    >
                      <RotateCcw className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                    </button>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                <span>
                  {new Date(log.queuedAt).toLocaleString('tr-TR')} • Deneme: {log.attemptCount}
                </span>
                <span className="text-indigo-600 dark:text-indigo-400 group-hover:translate-x-1 transition-transform">
                  Detay →
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {hasNextPage && (
        <button
          onClick={() => fetchNextPage()}
          disabled={isFetchingNextPage}
          className="w-full py-3 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {isFetchingNextPage && <Loader2 className="w-4 h-4 animate-spin" />}
          {isFetchingNextPage ? 'Yükleniyor...' : 'Daha Fazla Göster'}
        </button>
      )}
    </div>
  );
}
