import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { meModeration } from '@/api/dalClient';
import { CATEGORY_LABELS_TR, RISK_LEVEL_LABELS_TR, RISK_LEVEL_COLORS, ACTION_TYPE_LABELS_TR, MODERATION_STATUS_LABELS_TR } from '@/lib/moderationLabels';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertCircle, CheckCircle2, Clock, AlertTriangle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { tr } from 'date-fns/locale';

/**
 * Eğitici moderasyon durumu sayfası
 * Risk profili, ihlal geçmişi, aktif aksiyon gösterir
 */
function MyModerationStatus() {
  const [countdown, setCountdown] = useState(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['meModeration', 'status'],
    queryFn: meModeration.getStatus,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  // Suspensyon saydown'ı hesapla
  useEffect(() => {
    if (!data?.suspendedUntil) {
      setCountdown(null);
      return;
    }

    const updateCountdown = () => {
      const now = new Date();
      const suspended = new Date(data.suspendedUntil);
      const diff = suspended.getTime() - now.getTime();

      if (diff <= 0) {
        setCountdown(null);
        return;
      }

      const days = Math.floor(diff / 86400000);
      const hours = Math.floor((diff % 86400000) / 3600000);
      setCountdown({ days, hours });
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 60000); // Her dakika güncelle
    return () => clearInterval(interval);
  }, [data?.suspendedUntil]);

  if (isLoading) return <LoadingSkeleton />;
  if (isError) {
    return (
      <div className="container mx-auto max-w-4xl py-8 px-4">
        <Card className="border-rose-200 dark:border-rose-900/30 bg-rose-50 dark:bg-rose-900/10">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
              <p className="text-sm text-rose-800 dark:text-rose-200">
                Moderasyon durumu yüklenemedi. Lütfen daha sonra tekrar deneyin.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const riskScore = data?.riskScore;
  const recentViolations = data?.recentViolations || [];
  const activeAction = data?.activeAction;
  const suspendedUntil = data?.suspendedUntil;
  const isBanned = data?.isBanned;

  // Risk skoru rengi
  const getRiskColor = (level) => RISK_LEVEL_COLORS[level] || RISK_LEVEL_COLORS.LOW;

  return (
    <div className="container mx-auto max-w-4xl py-8 px-4">
      <h1 className="text-3xl font-bold text-slate-900 dark:text-gray-50 mb-8">İçerik Moderasyon Durumum</h1>

      {/* Kalıcı Ban Banner */}
      {isBanned && (
        <Card className="border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-900/20 mb-6">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-6 h-6 text-rose-600 dark:text-rose-400 shrink-0" />
              <div>
                <h3 className="font-semibold text-rose-900 dark:text-rose-100">Hesabınız Kalıcı Olarak Engellendi</h3>
                <p className="text-sm text-rose-800 dark:text-rose-200 mt-2">
                  Hesabınız platform politikası ihlalı nedeniyle kalıcı olarak kapatılmıştır.
                  Sorularınız için destek ekibine ulaşabilirsiniz: support@sinav-salonu.com
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Askıya Alma Banner */}
      {suspendedUntil && !isBanned && (
        <Card className="border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 mb-6">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <Clock className="w-6 h-6 text-amber-600 dark:text-amber-400 shrink-0" />
              <div className="flex-1">
                <h3 className="font-semibold text-amber-900 dark:text-amber-100">Hesabınız Askıya Alınmıştır</h3>
                <p className="text-sm text-amber-800 dark:text-amber-200 mt-2">
                  Hesabınız <strong>{new Date(suspendedUntil).toLocaleDateString('tr-TR')}</strong> tarihine kadar askıya alınmıştır.
                </p>
                {countdown && (
                  <p
                    className="text-sm text-amber-700 dark:text-amber-300 mt-1 font-medium"
                    role="status"
                    aria-live="polite"
                  >
                    Kalan süre: {countdown.days} gün {countdown.hours} saat
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Risk Profili */}
      {riskScore && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg">Risk Profili</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-2xl font-bold text-slate-900 dark:text-gray-50">
                  {riskScore.computedScore.toFixed(0)}
                </span>
                <div>
                  <p className="text-sm text-slate-600 dark:text-gray-400">Risk Puanı</p>
                  <Badge className={getRiskColor(riskScore.riskLevel)}>
                    {RISK_LEVEL_LABELS_TR[riskScore.riskLevel] || riskScore.riskLevel}
                  </Badge>
                </div>
              </div>
            </div>

            {/* Progress bar */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label htmlFor="risk-progress" className="text-sm font-medium text-slate-700 dark:text-gray-300">
                  Risk Seviyesi
                </label>
                <span className="text-xs text-slate-500 dark:text-gray-400">{Math.round(riskScore.computedScore)}%</span>
              </div>
              <div
                id="risk-progress"
                className="w-full h-2 bg-slate-200 dark:bg-gray-700 rounded-full overflow-hidden"
              >
                <div
                  className={cn(
                    'h-full transition-all duration-500',
                    riskScore.computedScore < 26 ? 'bg-emerald-500' :
                    riskScore.computedScore < 60 ? 'bg-amber-500' :
                    riskScore.computedScore < 96 ? 'bg-orange-500' :
                    'bg-rose-600',
                  )}
                  style={{ width: `${Math.min(riskScore.computedScore, 100)}%` }}
                />
              </div>
            </div>

            {/* İstatistikler */}
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-slate-50 dark:bg-gray-800/50 rounded-lg p-4">
                <p className="text-xs font-medium text-slate-600 dark:text-gray-400 mb-1">Açık İhlal</p>
                <p className="text-2xl font-bold text-slate-900 dark:text-gray-50">{riskScore.openViolations || 0}</p>
              </div>
              <div className="bg-slate-50 dark:bg-gray-800/50 rounded-lg p-4">
                <p className="text-xs font-medium text-slate-600 dark:text-gray-400 mb-1">Toplam İhlal</p>
                <p className="text-2xl font-bold text-slate-900 dark:text-gray-50">{riskScore.violationCount || 0}</p>
              </div>
              <div className="bg-slate-50 dark:bg-gray-800/50 rounded-lg p-4">
                <p className="text-xs font-medium text-slate-600 dark:text-gray-400 mb-1">Yüksek Şiddet</p>
                <p className="text-2xl font-bold text-slate-900 dark:text-gray-50">{riskScore.highSeverityCount || 0}</p>
              </div>
            </div>

            {riskScore.lastViolationAt && (
              <p className="text-xs text-slate-600 dark:text-gray-400">
                Son ihlal: {formatDistanceToNow(new Date(riskScore.lastViolationAt), { addSuffix: true, locale: tr })}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Aktif Aksiyon */}
      {activeAction && (
        <Card className="border-orange-200 dark:border-orange-900/30 mb-6">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-orange-600 dark:text-orange-400" />
              Aktif Aksiyon
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="text-xs text-slate-600 dark:text-gray-400 mb-1">Aksiyon Türü</p>
              <Badge className="bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300">
                {ACTION_TYPE_LABELS_TR[activeAction.actionType] || activeAction.actionType}
              </Badge>
            </div>
            {activeAction.reason && (
              <div>
                <p className="text-xs text-slate-600 dark:text-gray-400 mb-1">Neden</p>
                <p className="text-sm text-slate-800 dark:text-gray-200">{activeAction.reason}</p>
              </div>
            )}
            {activeAction.expiresAt && (
              <div>
                <p className="text-xs text-slate-600 dark:text-gray-400 mb-1">Bitiş Tarihi</p>
                <p className="text-sm text-slate-800 dark:text-gray-200">
                  {new Date(activeAction.expiresAt).toLocaleDateString('tr-TR')}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Son 30 Gün İhlalleri */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Son 30 Gün İhlalleri</CardTitle>
        </CardHeader>
        <CardContent>
          {recentViolations.length === 0 ? (
            <div className="bg-emerald-50 dark:bg-emerald-900/10 rounded-lg p-4 border border-emerald-200 dark:border-emerald-900/30">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                <p className="text-sm text-emerald-800 dark:text-emerald-200">
                  Son 30 günde ihlal yok. İçerikleriniz temiz görünüyor!
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {recentViolations.map((violation) => (
                <div
                  key={violation.id}
                  className="border border-slate-200 dark:border-gray-700 rounded-lg p-4 space-y-2"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-medium text-slate-600 dark:text-gray-400">
                          {formatDistanceToNow(new Date(violation.createdAt), { addSuffix: true, locale: tr })}
                        </span>
                        <Badge variant="outline" className="text-xs">
                          {violation.entityType === 'QUESTION' ? 'Soru' : violation.entityType === 'TEST' ? 'Test' : 'İçerik'}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge className="bg-slate-200 text-slate-700 dark:bg-gray-700 dark:text-gray-300">
                          {CATEGORY_LABELS_TR[violation.category] || violation.category}
                        </Badge>
                        <SeverityStars severity={violation.severity} />
                        <Badge variant="secondary" className="text-xs">
                          {MODERATION_STATUS_LABELS_TR[violation.status] || violation.status}
                        </Badge>
                      </div>
                    </div>
                  </div>
                  {violation.flaggedContent && (
                    <div className="bg-slate-50 dark:bg-gray-800/50 rounded p-2 text-xs text-slate-600 dark:text-gray-400 font-mono break-words">
                      {violation.flaggedContent.length > 200
                        ? `${violation.flaggedContent.slice(0, 200)}...`
                        : violation.flaggedContent}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Şiddet derecesi için yıldız göstergesi
 */
function SeverityStars({ severity }) {
  const level = Math.min(Math.max(severity || 1, 1), 5);
  return (
    <span className="text-xs text-amber-600 dark:text-amber-400" aria-label={`Şiddet: ${level}/5`}>
      {'★'.repeat(level)}{'☆'.repeat(5 - level)}
    </span>
  );
}

/**
 * Yükleme iskeleteti
 */
function LoadingSkeleton() {
  return (
    <div className="container mx-auto max-w-4xl py-8 px-4">
      <Skeleton className="h-10 w-1/3 mb-8" />
      <Card className="mb-6">
        <CardHeader>
          <Skeleton className="h-6 w-1/4" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-2 w-full" />
          <div className="grid grid-cols-3 gap-4">
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-1/3" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </CardContent>
      </Card>
    </div>
  );
}

export default MyModerationStatus;
