import { useState } from 'react';
import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { adminBackup } from '@/api/dalClient';
import { toast } from 'sonner';
import { formatRelativeTime } from '@/lib/i18n';
import * as Dialog from '@radix-ui/react-dialog';
import {
  Database,
  PlayCircle,
  CheckCircle2,
  XCircle,
  Loader2,
  Clock,
  HardDrive,
  Calendar,
  User,
  ChevronDown,
  AlertCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── Yardımcı fonksiyonlar ──────────────────────────────────────────────────

/** BigInt olarak gelen sizeBytes string'ini MB formatına çevirir */
function formatBytes(sizeBytes) {
  const n = Number(sizeBytes);
  if (!sizeBytes || isNaN(n) || n === 0) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

/** durationMs sayısını insan okunabilir formata çevirir */
function formatDuration(ms) {
  if (!ms || isNaN(ms)) return '—';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

// ─── Status Badge ────────────────────────────────────────────────────────────

function StatusBadge({ status, t }) {
  const configs = {
    RUNNING: {
      cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
      Icon: Loader2,
      spin: true,
    },
    SUCCESS: {
      cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
      Icon: CheckCircle2,
      spin: false,
    },
    FAILED: {
      cls: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
      Icon: XCircle,
      spin: false,
    },
  };
  const cfg = configs[status] ?? configs.FAILED;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium',
        cfg.cls,
      )}
    >
      <cfg.Icon
        className={cn('w-3 h-3', cfg.spin && 'animate-spin')}
        aria-hidden="true"
      />
      {t(`backup.logs.status.${status}`, status)}
    </span>
  );
}

// ─── Trigger Badge ───────────────────────────────────────────────────────────

function TriggerBadge({ trigger, t }) {
  const isManual = trigger === 'MANUAL';
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium',
        isManual
          ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300'
          : 'bg-slate-100 text-slate-600 dark:bg-gray-700 dark:text-gray-300',
      )}
    >
      {isManual ? (
        <User className="w-3 h-3" aria-hidden="true" />
      ) : (
        <Clock className="w-3 h-3" aria-hidden="true" />
      )}
      {t(`backup.logs.trigger.${trigger}`, trigger)}
    </span>
  );
}

// ─── Log Satırı ─────────────────────────────────────────────────────────────

function LogRow({ log, t }) {
  return (
    <tr className="border-b border-slate-100 dark:border-gray-800 hover:bg-slate-50 dark:hover:bg-gray-800/50">
      <td className="px-4 py-3 whitespace-nowrap">
        <TriggerBadge trigger={log.trigger} t={t} />
      </td>
      <td className="px-4 py-3 whitespace-nowrap">
        <StatusBadge status={log.status} t={t} />
      </td>
      <td className="px-4 py-3 text-sm text-slate-600 dark:text-gray-400 whitespace-nowrap">
        {log.createdAt ? formatRelativeTime(new Date(log.createdAt)) : '—'}
      </td>
      <td className="px-4 py-3 text-sm text-slate-600 dark:text-gray-400 whitespace-nowrap">
        {formatDuration(log.durationMs)}
      </td>
      <td className="px-4 py-3 text-sm text-slate-600 dark:text-gray-400 whitespace-nowrap">
        {formatBytes(log.sizeBytes)}
      </td>
      <td className="px-4 py-3 text-sm text-slate-600 dark:text-gray-400 max-w-xs truncate">
        {log.fileName || t('backup.logs.unknownFile')}
      </td>
      <td className="px-4 py-3 text-sm text-slate-600 dark:text-gray-400 whitespace-nowrap">
        {log.actor?.username ?? t('backup.logs.noActor')}
      </td>
      {log.errorMessage && (
        <td className="px-4 py-3">
          <span
            className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1"
            title={log.errorMessage}
          >
            <AlertCircle className="w-3 h-3 shrink-0" aria-hidden="true" />
            <span className="truncate max-w-[180px]">{log.errorMessage}</span>
          </span>
        </td>
      )}
    </tr>
  );
}

// ─── Skeleton ────────────────────────────────────────────────────────────────

function RowSkeleton() {
  return (
    <tr className="border-b border-slate-100 dark:border-gray-800">
      {Array.from({ length: 7 }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-4 bg-slate-200 dark:bg-gray-700 rounded animate-pulse w-20" />
        </td>
      ))}
    </tr>
  );
}

// ─── Bölüm kart sarmalayıcısı ────────────────────────────────────────────────

function SectionCard({ title, icon: Icon, children }) {
  return (
    <section className="bg-white dark:bg-gray-900 rounded-2xl border border-slate-200 dark:border-gray-800 overflow-hidden">
      <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100 dark:border-gray-800">
        <div className="w-8 h-8 bg-indigo-50 dark:bg-indigo-900/30 rounded-lg flex items-center justify-center">
          <Icon className="w-4 h-4 text-indigo-600 dark:text-indigo-400" aria-hidden="true" />
        </div>
        <h2 className="text-base font-semibold text-slate-900 dark:text-gray-100">{title}</h2>
      </div>
      <div className="p-6">{children}</div>
    </section>
  );
}

// ─── Ana Sayfa ────────────────────────────────────────────────────────────────

export default function BackupManagement() {
  const { t } = useTranslation('pages');
  const queryClient = useQueryClient();

  // ── Form state ──
  const [formEnabled, setFormEnabled] = useState(null);
  const [formCron, setFormCron] = useState('');
  const [formDir, setFormDir] = useState('');
  const [formRetention, setFormRetention] = useState('');
  const [formTouched, setFormTouched] = useState(false);
  const [formError, setFormError] = useState(null);

  // ── Log filtresi ──
  const [statusFilter, setStatusFilter] = useState('');

  // ── Confirm dialog ──
  const [confirmOpen, setConfirmOpen] = useState(false);

  // ── Settings query ──
  const { data: settings, isLoading: settingsLoading } = useQuery({
    queryKey: ['backup', 'settings'],
    queryFn: () => adminBackup.getSettings(),
    onSuccess: (data) => {
      if (!formTouched) {
        setFormEnabled(data.backupEnabled ?? false);
        setFormCron(data.backupCronExpression ?? '');
        setFormDir(data.backupTargetDir ?? '');
        setFormRetention(data.backupRetentionDays != null ? String(data.backupRetentionDays) : '2');
      }
    },
  });

  // settings yüklendikten sonra form değerlerini başlat (onSuccess React Query v5'te kaldırıldı, manuel)
  const resolvedEnabled = formTouched ? formEnabled : (settings?.backupEnabled ?? false);
  const resolvedCron = formTouched ? formCron : (settings?.backupCronExpression ?? '');
  const resolvedDir = formTouched ? formDir : (settings?.backupTargetDir ?? '');
  const resolvedRetention = formTouched ? formRetention : (settings?.backupRetentionDays != null ? String(settings.backupRetentionDays) : '2');

  // ── Save settings mutation ──
  const saveMutation = useMutation({
    mutationFn: (body) => adminBackup.updateSettings(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['backup', 'settings'] });
      toast.success(t('backup.settings.saved'));
      setFormError(null);
    },
    onError: (err) => {
      const msg = err?.response?.data?.message ?? err?.message ?? t('backup.settings.saveFailed');
      setFormError(msg);
      toast.error(msg);
    },
  });

  // ── Run now mutation ──
  const runNowMutation = useMutation({
    mutationFn: () => adminBackup.runNow(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['backup', 'logs'] });
      toast.success(t('backup.runNow.success'));
      setConfirmOpen(false);
    },
    onError: (err) => {
      const msg = err?.response?.data?.message ?? err?.message ?? t('backup.runNow.failed');
      toast.error(msg);
      setConfirmOpen(false);
    },
  });

  // ── Logs infinite query ──
  const {
    data: logsData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: logsLoading,
  } = useInfiniteQuery({
    queryKey: ['backup', 'logs', statusFilter],
    queryFn: ({ pageParam }) =>
      adminBackup.listLogs({
        cursor: pageParam,
        limit: 20,
        status: statusFilter || undefined,
      }),
    initialPageParam: null,
    getNextPageParam: (lastPage) => lastPage?.nextCursor ?? undefined,
    staleTime: 30_000,
  });

  const logItems = logsData?.pages.flatMap((p) => p.items ?? []) ?? [];

  // ── Form submit ──
  const handleSettingsSubmit = (e) => {
    e.preventDefault();
    setFormError(null);
    const retention = parseInt(resolvedRetention, 10);
    saveMutation.mutate({
      backupEnabled: resolvedEnabled,
      backupCronExpression: resolvedCron.trim(),
      backupTargetDir: resolvedDir.trim(),
      backupRetentionDays: isNaN(retention) ? 2 : retention,
    });
  };

  const markTouched = () => {
    if (!formTouched) {
      setFormTouched(true);
      // ilk dokunuşta settings'ten değerleri al
      if (settings) {
        setFormEnabled(settings.backupEnabled ?? false);
        setFormCron(settings.backupCronExpression ?? '');
        setFormDir(settings.backupTargetDir ?? '');
        setFormRetention(settings.backupRetentionDays != null ? String(settings.backupRetentionDays) : '2');
      }
    }
  };

  // ── Filter seçenekleri ──
  const filterOptions = [
    { value: '', label: t('backup.logs.filterAll') },
    { value: 'SUCCESS', label: t('backup.logs.filterSuccess') },
    { value: 'FAILED', label: t('backup.logs.filterFailed') },
    { value: 'RUNNING', label: t('backup.logs.filterRunning') },
  ];

  return (
    <main
      id="main"
      className="p-6 space-y-6 max-w-5xl mx-auto"
      aria-label={t('backup.title')}
    >
      {/* Başlık */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-gray-100 flex items-center gap-2">
          <Database className="w-6 h-6 text-indigo-600 dark:text-indigo-400" aria-hidden="true" />
          {t('backup.title')}
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-gray-400">{t('backup.subtitle')}</p>
      </div>

      {/* ─── Bölüm 1: Zamanlayıcı Ayarları ─── */}
      <SectionCard title={t('backup.settings.heading')} icon={Calendar}>
        {settingsLoading ? (
          <div className="space-y-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-10 bg-slate-100 dark:bg-gray-800 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : (
          <form onSubmit={handleSettingsSubmit} className="space-y-5" noValidate>
            {/* Toggle: otomatik yedekleme */}
            <div className="flex items-center justify-between">
              <label
                htmlFor="backup-enabled"
                className="text-sm font-medium text-slate-800 dark:text-gray-200 cursor-pointer select-none"
              >
                {t('backup.settings.enabled')}
              </label>
              <button
                type="button"
                id="backup-enabled"
                role="switch"
                aria-checked={resolvedEnabled}
                onClick={() => {
                  markTouched();
                  setFormEnabled((v) => !v);
                }}
                className={cn(
                  'relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500',
                  resolvedEnabled
                    ? 'bg-indigo-600'
                    : 'bg-slate-300 dark:bg-gray-600',
                )}
              >
                <span
                  className={cn(
                    'inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform',
                    resolvedEnabled ? 'translate-x-6' : 'translate-x-1',
                  )}
                />
              </button>
            </div>

            {/* Cron ifadesi */}
            <div className="space-y-1">
              <label
                htmlFor="backup-cron"
                className="block text-sm font-medium text-slate-800 dark:text-gray-200"
              >
                {t('backup.settings.cron')}
              </label>
              <input
                id="backup-cron"
                type="text"
                value={resolvedCron}
                onChange={(e) => { markTouched(); setFormCron(e.target.value); }}
                placeholder="0 3 * * *"
                className={cn(
                  'w-full rounded-lg border px-3 py-2 text-sm font-mono',
                  'bg-white dark:bg-gray-800 text-slate-900 dark:text-gray-100',
                  'border-slate-300 dark:border-gray-700',
                  'placeholder-slate-400 dark:placeholder-gray-500',
                  'focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent',
                )}
              />
              <p className="text-xs text-slate-500 dark:text-gray-400">
                {t('backup.settings.cronHelp')}
              </p>
            </div>

            {/* Hedef dizin */}
            <div className="space-y-1">
              <label
                htmlFor="backup-dir"
                className="block text-sm font-medium text-slate-800 dark:text-gray-200"
              >
                {t('backup.settings.targetDir')}
              </label>
              <input
                id="backup-dir"
                type="text"
                value={resolvedDir}
                onChange={(e) => { markTouched(); setFormDir(e.target.value); }}
                placeholder="/backups"
                className={cn(
                  'w-full rounded-lg border px-3 py-2 text-sm font-mono',
                  'bg-white dark:bg-gray-800 text-slate-900 dark:text-gray-100',
                  'border-slate-300 dark:border-gray-700',
                  'placeholder-slate-400 dark:placeholder-gray-500',
                  'focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent',
                )}
              />
              <p className="text-xs text-slate-500 dark:text-gray-400">
                {t('backup.settings.targetDirHelp')}
              </p>
            </div>

            {/* Saklama süresi */}
            <div className="space-y-1">
              <label
                htmlFor="backup-retention"
                className="block text-sm font-medium text-slate-800 dark:text-gray-200"
              >
                {t('backup.settings.retentionDays')}
              </label>
              <input
                id="backup-retention"
                type="number"
                min={0}
                max={365}
                value={resolvedRetention}
                onChange={(e) => { markTouched(); setFormRetention(e.target.value); }}
                className={cn(
                  'w-32 rounded-lg border px-3 py-2 text-sm',
                  'bg-white dark:bg-gray-800 text-slate-900 dark:text-gray-100',
                  'border-slate-300 dark:border-gray-700',
                  'focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent',
                )}
              />
              <p className="text-xs text-slate-500 dark:text-gray-400">
                {t('backup.settings.retentionDaysHelp')}
              </p>
            </div>

            {/* Form-level hata */}
            {formError && (
              <p role="alert" className="text-sm text-red-600 dark:text-red-400 flex items-center gap-1">
                <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
                {formError}
              </p>
            )}

            {/* Kaydet butonu */}
            <button
              type="submit"
              disabled={saveMutation.isPending}
              className={cn(
                'inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                'bg-indigo-600 text-white hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500',
                'disabled:opacity-50 disabled:cursor-not-allowed',
              )}
            >
              {saveMutation.isPending && (
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
              )}
              {t('backup.settings.save')}
            </button>
          </form>
        )}
      </SectionCard>

      {/* ─── Bölüm 2: Manuel Yedekleme ─── */}
      <SectionCard title={t('backup.runNow.heading')} icon={PlayCircle}>
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex-1">
            <p className="text-sm text-slate-600 dark:text-gray-400">
              {t('backup.runNow.description')}
            </p>
          </div>

          {/* Confirm Dialog */}
          <Dialog.Root open={confirmOpen} onOpenChange={setConfirmOpen}>
            <Dialog.Trigger asChild>
              <button
                type="button"
                className={cn(
                  'inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-colors shrink-0',
                  'bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-600',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500',
                )}
              >
                <Database className="w-4 h-4" aria-hidden="true" />
                {t('backup.runNow.button')}
              </button>
            </Dialog.Trigger>

            <Dialog.Portal>
              <Dialog.Overlay className="fixed inset-0 bg-black/50 z-40" />
              <Dialog.Content
                className={cn(
                  'fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50',
                  'bg-white dark:bg-gray-900 rounded-2xl shadow-xl p-6 w-full max-w-md',
                  'border border-slate-200 dark:border-gray-700',
                )}
                aria-describedby="backup-confirm-desc"
              >
                <Dialog.Title className="text-lg font-semibold text-slate-900 dark:text-gray-100 mb-2">
                  {t('backup.runNow.confirmTitle')}
                </Dialog.Title>
                <Dialog.Description
                  id="backup-confirm-desc"
                  className="text-sm text-slate-600 dark:text-gray-400 mb-6"
                >
                  {t('backup.runNow.confirmBody')}
                </Dialog.Description>

                <div className="flex justify-end gap-3">
                  <Dialog.Close asChild>
                    <button
                      type="button"
                      className={cn(
                        'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                        'border border-slate-300 dark:border-gray-700 text-slate-700 dark:text-gray-300',
                        'hover:bg-slate-50 dark:hover:bg-gray-800',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400',
                      )}
                    >
                      {t('backup.runNow.confirmCancel')}
                    </button>
                  </Dialog.Close>

                  <button
                    type="button"
                    onClick={() => runNowMutation.mutate()}
                    disabled={runNowMutation.isPending}
                    className={cn(
                      'inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                      'bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-600',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500',
                      'disabled:opacity-50 disabled:cursor-not-allowed',
                    )}
                  >
                    {runNowMutation.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                        {t('backup.runNow.starting')}
                      </>
                    ) : (
                      t('backup.runNow.confirmProceed')
                    )}
                  </button>
                </div>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
        </div>
      </SectionCard>

      {/* ─── Bölüm 3: Log Listesi ─── */}
      <SectionCard title={t('backup.logs.heading')} icon={HardDrive}>
        {/* Filtre */}
        <div className="mb-4 flex items-center gap-2">
          <div className="relative">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label={t('backup.logs.heading')}
              className={cn(
                'appearance-none pr-8 pl-3 py-2 rounded-lg border text-sm',
                'bg-white dark:bg-gray-800 text-slate-900 dark:text-gray-100',
                'border-slate-300 dark:border-gray-700',
                'focus:outline-none focus:ring-2 focus:ring-indigo-500',
              )}
            >
              {filterOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <ChevronDown
              className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none"
              aria-hidden="true"
            />
          </div>
        </div>

        {/* Tablo */}
        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-gray-800">
          <table className="w-full text-left">
            <caption className="sr-only">{t('backup.logs.heading')}</caption>
            <thead>
              <tr className="bg-slate-50 dark:bg-gray-800/60">
                <th
                  scope="col"
                  className="px-4 py-3 text-xs font-semibold text-slate-500 dark:text-gray-400 uppercase tracking-wide"
                >
                  {t('backup.logs.columns.trigger')}
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-xs font-semibold text-slate-500 dark:text-gray-400 uppercase tracking-wide"
                >
                  {t('backup.logs.columns.status')}
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-xs font-semibold text-slate-500 dark:text-gray-400 uppercase tracking-wide"
                >
                  {t('backup.logs.columns.createdAt')}
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-xs font-semibold text-slate-500 dark:text-gray-400 uppercase tracking-wide"
                >
                  {t('backup.logs.columns.duration')}
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-xs font-semibold text-slate-500 dark:text-gray-400 uppercase tracking-wide"
                >
                  {t('backup.logs.columns.size')}
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-xs font-semibold text-slate-500 dark:text-gray-400 uppercase tracking-wide"
                >
                  {t('backup.logs.columns.fileName')}
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-xs font-semibold text-slate-500 dark:text-gray-400 uppercase tracking-wide"
                >
                  {t('backup.logs.columns.actor')}
                </th>
              </tr>
            </thead>
            <tbody>
              {logsLoading
                ? Array.from({ length: 5 }).map((_, i) => <RowSkeleton key={i} />)
                : logItems.length === 0
                ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-4 py-12 text-center text-sm text-slate-400 dark:text-gray-500"
                    >
                      {t('backup.logs.empty')}
                    </td>
                  </tr>
                )
                : logItems.map((log) => <LogRow key={log.id} log={log} t={t} />)
              }
            </tbody>
          </table>
        </div>

        {/* Daha fazla yükle */}
        {hasNextPage && (
          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={() => fetchNextPage()}
              disabled={isFetchingNextPage}
              className={cn(
                'inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                'border border-slate-300 dark:border-gray-700 text-slate-700 dark:text-gray-300',
                'hover:bg-slate-50 dark:hover:bg-gray-800',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400',
                'disabled:opacity-50 disabled:cursor-not-allowed',
              )}
            >
              {isFetchingNextPage ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                  {t('backup.logs.loading')}
                </>
              ) : (
                t('backup.logs.loadMore')
              )}
            </button>
          </div>
        )}
      </SectionCard>
    </main>
  );
}
