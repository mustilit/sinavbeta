import { useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  CATEGORY_LABELS_TR,
  ACTION_TYPE_LABELS_TR,
  RISK_LEVEL_COLORS,
  RISK_LEVEL_LABELS_TR,
  CATEGORY_COLORS,
} from '@/lib/moderationLabels';
import { adminModeration } from '@/api/dalClient';
import { formatDistanceToNow } from 'date-fns';
import { tr } from 'date-fns/locale';
import { AlertTriangle, ArrowLeft, Star, Zap, Lock, Ban } from 'lucide-react';
import { toast } from 'sonner';

function ActionModal({ isOpen, onClose, onSubmit, actionType, isPending }) {
  const [reason, setReason] = useState('');
  const [duration, setDuration] = useState('3');
  const [errors, setErrors] = useState({});

  const handleSubmit = () => {
    const newErrors = {};
    if (!reason || reason.trim().length < 20) {
      newErrors.reason = 'Gerekçe en az 20 karakter olmalı';
    }
    if (actionType === 'ACCOUNT_SUSPENDED' && !duration) {
      newErrors.duration = 'Süre seçmelisiniz';
    }
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }
    onSubmit({
      reason: reason.trim(),
      durationDays: actionType === 'ACCOUNT_SUSPENDED' ? parseInt(duration, 10) : undefined,
    });
    setReason('');
    setDuration('3');
    setErrors({});
    onClose();
  };

  const getTitle = () => {
    if (actionType === 'WARN') return 'Uyarı Gönder';
    if (actionType === 'ACCOUNT_SUSPENDED') return 'Hesabı Askıya Al';
    if (actionType === 'ACCOUNT_BANNED') return 'Hesabı Yasakla';
    return 'İşlem Uygula';
  };

  const getDescription = () => {
    if (actionType === 'WARN') return 'Bu eğiticiye bir uyarı göndereceksiniz.';
    if (actionType === 'ACCOUNT_SUSPENDED') return 'Eğitici belirli bir süre için giriş yapamayacak.';
    if (actionType === 'ACCOUNT_BANNED') return 'Eğitici platformdan kalıcı olarak yasaklanacak.';
    return '';
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{getTitle()}</DialogTitle>
          <DialogDescription>{getDescription()}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="action-reason" className="text-sm font-medium text-gray-900 dark:text-gray-100">
              Gerekçe (min 20 karakter)
            </Label>
            <textarea
              id="action-reason"
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                if (errors.reason) setErrors({ ...errors, reason: undefined });
              }}
              placeholder="Bu işlemin nedenini açıklayınız..."
              className="w-full mt-2 px-3 py-2 border rounded-md text-sm
                         bg-white dark:bg-gray-800
                         text-gray-900 dark:text-gray-100
                         border-gray-200 dark:border-gray-700
                         focus:outline-none focus:ring-2 focus:ring-indigo-500"
              rows={4}
              aria-label="İşlem gerekçesi"
              aria-invalid={Boolean(errors.reason)}
              aria-describedby={errors.reason ? 'reason-error' : undefined}
            />
            {errors.reason && (
              <p id="reason-error" role="alert" className="text-xs text-red-600 dark:text-red-400 mt-1">
                {errors.reason}
              </p>
            )}
          </div>

          {actionType === 'ACCOUNT_SUSPENDED' && (
            <div>
              <Label htmlFor="action-duration" className="text-sm font-medium text-gray-900 dark:text-gray-100">
                Askıya Alma Süresi
              </Label>
              <select
                id="action-duration"
                value={duration}
                onChange={(e) => {
                  setDuration(e.target.value);
                  if (errors.duration) setErrors({ ...errors, duration: undefined });
                }}
                className="w-full mt-2 px-3 py-2 border rounded-md text-sm
                           bg-white dark:bg-gray-800
                           text-gray-900 dark:text-gray-100
                           border-gray-200 dark:border-gray-700
                           focus:outline-none focus:ring-2 focus:ring-indigo-500"
                aria-label="Askıya alma süresi"
                aria-invalid={Boolean(errors.duration)}
                aria-describedby={errors.duration ? 'duration-error' : undefined}
              >
                <option value="3">3 gün</option>
                <option value="7">7 gün</option>
                <option value="30">30 gün</option>
                <option value="unlimited">Sınırsız</option>
              </select>
              {errors.duration && (
                <p id="duration-error" role="alert" className="text-xs text-red-600 dark:text-red-400 mt-1">
                  {errors.duration}
                </p>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            İptal
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isPending}
            className="bg-indigo-600 hover:bg-indigo-700"
          >
            {isPending ? 'Uygulanıyor...' : 'Uygula'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RevokeActionDialog({ isOpen, onClose, onConfirm, isPending }) {
  return (
    <AlertDialog open={isOpen} onOpenChange={onClose}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Yaptırımı Geri Al?</AlertDialogTitle>
          <AlertDialogDescription>
            En son uygulanan yaptırım (uyarı/askı/yasaklama) iptal edilecek.
            Bu işlem geri alınamaz.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex justify-end gap-2">
          <AlertDialogCancel disabled={isPending}>İptal</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={isPending}
            className="bg-rose-600 hover:bg-rose-700"
          >
            {isPending ? 'İptal Ediliyor...' : 'Geri Al'}
          </AlertDialogAction>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default function EducatorViolationDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [actionModal, setActionModal] = useState(false);
  const [actionType, setActionType] = useState('WARN');
  const [revokeOpen, setRevokeOpen] = useState(false);
  const [revokeActionId, setRevokeActionId] = useState(null);
  const sentinelRef = useRef(null);

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
  } = useInfiniteQuery({
    queryKey: ['adminModeration', 'educator', id],
    queryFn: ({ pageParam }) =>
      adminModeration.getEducatorViolations(id, { cursor: pageParam }),
    initialPageParam: null,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: !!id,
  });

  const applyActionMutation = useMutation({
    mutationFn: ({ actionType: type, reason, durationDays }) =>
      adminModeration.applyAction(id, {
        actionType: type,
        reason,
        durationDays,
      }),
    onSuccess: () => {
      toast.success('İşlem uygulandı');
      queryClient.invalidateQueries({ queryKey: ['adminModeration', 'educator', id] });
      queryClient.invalidateQueries({ queryKey: ['adminModeration', 'risky-educators'] });
      setActionModal(false);
    },
    onError: (err) => {
      toast.error(err?.response?.data?.message || 'Hata oluştu');
    },
  });

  const revokeActionMutation = useMutation({
    mutationFn: () => adminModeration.revokeAction(revokeActionId),
    onSuccess: () => {
      toast.success('Yaptırım geri alındı');
      queryClient.invalidateQueries({ queryKey: ['adminModeration', 'educator', id] });
      queryClient.invalidateQueries({ queryKey: ['adminModeration', 'risky-educators'] });
      setRevokeOpen(false);
      setRevokeActionId(null);
    },
    onError: (err) => {
      toast.error(err?.response?.data?.message || 'Hata oluştu');
    },
  });

  const educator = data?.pages?.[0]?.educator;
  const riskScore = data?.pages?.[0]?.riskScore;
  const items = data?.pages?.flatMap((p) => p.items) ?? [];

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (isError || !educator) {
    return (
      <div className="p-6">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 hover:underline mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Geri Dön
        </button>
        <Card className="bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800">
          <CardContent className="pt-6">
            <p className="text-red-700 dark:text-red-300">Eğitici bulunamadı</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const suspendedUntil = educator.suspendedUntil ? new Date(educator.suspendedUntil) : null;
  const isSuspended = suspendedUntil && suspendedUntil > new Date();
  const lastAction = items[0]?.action;
  const latestActionId = lastAction?.id;

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      {/* Header */}
      <div className="flex items-start gap-4">
        <button
          onClick={() => navigate(-1)}
          type="button"
          aria-label="Geri dön"
          className="mt-1 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors flex-shrink-0"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            Eğitici İhlal Geçmişi
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            {educator.username} ({educator.email})
          </p>
        </div>
      </div>

      {/* Warnings */}
      {educator.isBanned && (
        <Card className="bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800">
          <CardContent className="pt-6 flex items-start gap-3">
            <Ban className="w-5 h-5 text-red-700 dark:text-red-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-red-700 dark:text-red-300">Hesap Yasaklandı</p>
              <p className="text-sm text-red-600 dark:text-red-400 mt-0.5">
                Bu eğitici platform'tan kalıcı olarak yasaklanmıştır.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {isSuspended && (
        <Card className="bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800">
          <CardContent className="pt-6 flex items-start gap-3">
            <Lock className="w-5 h-5 text-amber-700 dark:text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-amber-700 dark:text-amber-300">Hesap Askıya Alındı</p>
              <p className="text-sm text-amber-600 dark:text-amber-400 mt-0.5">
                {formatDistanceToNow(suspendedUntil, { locale: tr, addSuffix: true })} kadar giriş yapamayacak.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Risk Score Summary */}
      {riskScore && (
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardHeader>
            <CardTitle className="text-lg text-gray-900 dark:text-gray-100">
              Risk Profili
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Risk Seviyesi</p>
                <Badge className={`mt-2 ${RISK_LEVEL_COLORS[riskScore.riskLevel] || RISK_LEVEL_COLORS.LOW}`}>
                  {RISK_LEVEL_LABELS_TR[riskScore.riskLevel] || riskScore.riskLevel}
                </Badge>
              </div>
              <div className="text-right">
                <p className="text-3xl font-bold text-gray-900 dark:text-gray-100">
                  {(riskScore.computedScore * 100).toFixed(1)}%
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Hesaplanan Puan</p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4 pt-4 border-t border-gray-200 dark:border-gray-700">
              <div>
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Toplam İhlal
                </p>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">
                  {riskScore.violationCount || 0}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Açık İhlal
                </p>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">
                  {riskScore.openViolations || 0}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Ağır İhlal
                </p>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">
                  {riskScore.highSeverityCount || 0}
                </p>
              </div>
            </div>

            {riskScore.lastViolationAt && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-4">
                Son ihlal: {formatDistanceToNow(new Date(riskScore.lastViolationAt), { locale: tr, addSuffix: true })}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Quick Actions Sidebar */}
      <Card className="sticky top-24 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 z-10">
        <CardHeader>
          <CardTitle className="text-lg text-gray-900 dark:text-gray-100">
            İşlem Yönetimi
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button
            onClick={() => {
              setActionType('WARN');
              setActionModal(true);
            }}
            variant="outline"
            className="w-full justify-start gap-2"
            disabled={applyActionMutation.isPending}
          >
            <AlertTriangle className="w-4 h-4" />
            Uyar
          </Button>
          <Button
            onClick={() => {
              setActionType('ACCOUNT_SUSPENDED');
              setActionModal(true);
            }}
            variant="outline"
            className="w-full justify-start gap-2"
            disabled={applyActionMutation.isPending}
          >
            <Lock className="w-4 h-4" />
            Askıya Al
          </Button>
          <Button
            onClick={() => {
              setActionType('ACCOUNT_BANNED');
              setActionModal(true);
            }}
            variant="outline"
            className="w-full justify-start gap-2 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-800"
            disabled={applyActionMutation.isPending}
          >
            <Ban className="w-4 h-4" />
            Yasakla
          </Button>

          {latestActionId && (
            <Button
              onClick={() => {
                setRevokeActionId(latestActionId);
                setRevokeOpen(true);
              }}
              variant="outline"
              className="w-full justify-start gap-2 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800 mt-4 pt-4 border-t"
              disabled={revokeActionMutation.isPending}
            >
              <Zap className="w-4 h-4" />
              Yaptırımı Geri Al
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Violations Timeline */}
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardHeader>
          <CardTitle className="text-lg text-gray-900 dark:text-gray-100">
            İhlal Geçmişi
          </CardTitle>
        </CardHeader>
        <CardContent>
          {items.length > 0 ? (
            <div className="space-y-4">
              {items.map((item) => (
                <div key={item.id} className="pb-4 border-b border-gray-200 dark:border-gray-700 last:pb-0 last:border-0">
                  <div className="flex items-start justify-between gap-4 mb-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {formatDistanceToNow(new Date(item.result.createdAt), { locale: tr, addSuffix: true })}
                      </p>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {Array.isArray(item.result.categories) && item.result.categories.map((cat) => (
                          <Badge
                            key={cat}
                            className={CATEGORY_COLORS[cat] || CATEGORY_COLORS.OTHER}
                            variant="sm"
                          >
                            {CATEGORY_LABELS_TR[cat] || cat}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <Badge
                      className={
                        item.status === 'OPEN'
                          ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                          : item.status === 'DISMISSED'
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                          : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                      }
                    >
                      {item.status}
                    </Badge>
                  </div>

                  <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">
                    {(item.result.flaggedContent || '').substring(0, 150)}
                  </p>

                  {item.result.reasonText && (
                    <details className="group">
                      <summary className="cursor-pointer text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline">
                        Claude Analiz
                      </summary>
                      <p className="mt-2 text-xs text-gray-600 dark:text-gray-400 whitespace-pre-wrap">
                        {item.result.reasonText}
                      </p>
                    </details>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500 dark:text-gray-400">İhlal bulunamadı</p>
          )}

          {hasNextPage && (
            <button
              ref={sentinelRef}
              onClick={() => fetchNextPage()}
              disabled={isFetchingNextPage}
              type="button"
              className="w-full mt-6 py-2 border rounded bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50 transition-colors text-sm font-medium"
            >
              {isFetchingNextPage ? 'Yükleniyor...' : 'Daha Eski İhlalleri Yükle'}
            </button>
          )}
        </CardContent>
      </Card>

      {/* Actions History */}
      {items.some((i) => i.action) && (
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardHeader>
            <CardTitle className="text-lg text-gray-900 dark:text-gray-100">
              Uygulanan Yaptırımlar
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {items
                .filter((i) => i.action)
                .map((item) => (
                  <div
                    key={item.action.id}
                    className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <Badge variant="outline" className="bg-white dark:bg-gray-800">
                        {ACTION_TYPE_LABELS_TR[item.action.actionType] || item.action.actionType}
                      </Badge>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {formatDistanceToNow(new Date(item.action.createdAt), { locale: tr, addSuffix: true })}
                      </p>
                    </div>
                    <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">
                      {item.action.reason}
                    </p>
                    <div className="flex items-center justify-between text-xs text-gray-600 dark:text-gray-400">
                      <span>
                        {item.action.actor ? 'Admin tarafından' : 'Sistem tarafından'}
                      </span>
                      {item.action.expiresAt && (
                        <span>
                          Bitiş: {formatDistanceToNow(new Date(item.action.expiresAt), { locale: tr, addSuffix: true })}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Modals */}
      <ActionModal
        isOpen={actionModal}
        onClose={() => setActionModal(false)}
        onSubmit={(data) => applyActionMutation.mutate({ actionType, ...data })}
        actionType={actionType}
        isPending={applyActionMutation.isPending}
      />

      <RevokeActionDialog
        isOpen={revokeOpen}
        onClose={() => setRevokeOpen(false)}
        onConfirm={() => revokeActionMutation.mutate()}
        isPending={revokeActionMutation.isPending}
      />
    </div>
  );
}
