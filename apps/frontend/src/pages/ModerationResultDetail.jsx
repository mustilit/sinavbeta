import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  CATEGORY_LABELS_TR,
  MODERATION_STATUS_LABELS_TR,
  PROVIDER_LABELS_TR,
  MODERATION_STATUS_COLORS,
  CATEGORY_COLORS,
  RISK_LEVEL_COLORS,
  RISK_LEVEL_LABELS_TR,
} from '@/lib/moderationLabels';
import { adminModeration } from '@/api/dalClient';
import { formatDistanceToNow } from 'date-fns';
import { tr } from 'date-fns/locale';
import { AlertTriangle, CheckCircle, XCircle, ArrowLeft, Copy } from 'lucide-react';
import { toast } from 'sonner';

function DecideModal({ isOpen, onClose, onSubmit, status, isPending }) {
  const [reviewNote, setReviewNote] = useState('');
  const isApprove = status === 'approve';

  const handleSubmit = () => {
    onSubmit(reviewNote);
    setReviewNote('');
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isApprove ? 'İçeriği Temiz İşaretle' : 'İhlal Onayla'}
          </DialogTitle>
          <DialogDescription>
            {isApprove
              ? 'Bu içeriğin herhangi bir ihlali olmadığını onaylıyorsunuz.'
              : 'Bu içerikte ihlal tespit ettiniz ve işlem başlatacaksınız.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label htmlFor="review-note" className="text-sm font-medium text-gray-900 dark:text-gray-100">
              İncelemeci Notu (opsiyonel)
            </Label>
            <textarea
              id="review-note"
              value={reviewNote}
              onChange={(e) => setReviewNote(e.target.value)}
              placeholder="Karar ile ilgili notunuz..."
              className="w-full mt-2 px-3 py-2 border rounded-md text-sm
                         bg-white dark:bg-gray-800
                         text-gray-900 dark:text-gray-100
                         border-gray-200 dark:border-gray-700
                         focus:outline-none focus:ring-2 focus:ring-indigo-500"
              rows={4}
              aria-label="İncelemeci notu"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            İptal
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isPending}
            className={isApprove ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'}
          >
            {isApprove ? 'Onayla (Temiz)' : 'Onayla (İhlal)'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function ModerationResultDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [decideOpen, setDecideOpen] = useState(false);
  const [decideAction, setDecideAction] = useState('approve');

  const { data: result, isLoading, isError } = useQuery({
    queryKey: ['adminModeration', 'result', id],
    queryFn: () => adminModeration.getResult(id),
    enabled: !!id,
  });

  const approveMutation = useMutation({
    mutationFn: (reviewerNote) => adminModeration.approveResult(id, { reviewerNote }),
    onSuccess: () => {
      toast.success('İçerik onaylandı');
      queryClient.invalidateQueries({ queryKey: ['adminModeration', 'queue'] });
      queryClient.invalidateQueries({ queryKey: ['adminModeration', 'result', id] });
      setTimeout(() => navigate(-1), 500);
    },
    onError: (err) => {
      toast.error(err?.response?.data?.message || 'Hata oluştu');
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (reviewerNote) => adminModeration.rejectResult(id, { reviewerNote }),
    onSuccess: () => {
      toast.success('İhlal onaylandı');
      queryClient.invalidateQueries({ queryKey: ['adminModeration', 'queue'] });
      queryClient.invalidateQueries({ queryKey: ['adminModeration', 'result', id] });
      setTimeout(() => navigate(-1), 500);
    },
    onError: (err) => {
      toast.error(err?.response?.data?.message || 'Hata oluştu');
    },
  });

  const handleDecide = (reviewerNote) => {
    if (decideAction === 'approve') {
      approveMutation.mutate(reviewerNote);
    } else {
      rejectMutation.mutate(reviewerNote);
    }
    setDecideOpen(false);
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-16 w-full" />
        <div className="grid grid-cols-2 gap-6">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  if (isError || !result) {
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
            <p className="text-red-700 dark:text-red-300">Sonuç bulunamadı</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const categories = Array.isArray(result.categories) ? result.categories : [];
  const scores = result.scores || {};
  const matchedTerms = Array.isArray(result.matchedTerms) ? result.matchedTerms : [];
  const createdDate = new Date(result.createdAt);
  const contentSnippet = (result.flaggedContent || '').substring(0, 500);

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4 flex-1 min-w-0">
          <button
            onClick={() => navigate(-1)}
            type="button"
            aria-label="Geri dön"
            className="mt-1 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors flex-shrink-0"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              Moderasyon Sonucu Detayı
            </h1>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              {formatDistanceToNow(createdDate, { locale: tr, addSuffix: true })}
            </p>
          </div>
        </div>
      </div>

      {/* Status & Meta */}
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle className="text-lg text-gray-900 dark:text-gray-100">
                Durum ve Bilgiler
              </CardTitle>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Badge
                className={`${
                  MODERATION_STATUS_COLORS[result.status] || MODERATION_STATUS_COLORS.PENDING_REVIEW
                }`}
              >
                {MODERATION_STATUS_LABELS_TR[result.status] || result.status}
              </Badge>
              <Badge variant="outline" className="bg-gray-50 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                {PROVIDER_LABELS_TR[result.provider] || result.provider}
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">İçerik Türü</p>
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 mt-1">
                {result.entityType || 'Bilinmiyor'}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Güvenilirlik Puanı</p>
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 mt-1">
                {(result.score * 100).toFixed(1)}%
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Maliyeti</p>
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 mt-1">
                ${(result.cost || 0).toFixed(4)}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Gecikme</p>
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 mt-1">
                {result.latencyMs || 0}ms
              </p>
            </div>
          </div>

          {/* Eğitici Bilgisi */}
          {result.user && (
            <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-2">
                Eğitici
              </p>
              <a
                href={`/yonetim/moderasyon/eğitici/${result.user.id}`}
                className="inline-flex items-center gap-2 text-indigo-600 dark:text-indigo-400 hover:underline text-sm"
              >
                <span className="font-medium">{result.user.username}</span>
                <span className="text-xs text-gray-500 dark:text-gray-400">({result.user.email})</span>
              </a>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Content & Analysis */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Sol: İçerik */}
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardHeader>
            <CardTitle className="text-lg text-gray-900 dark:text-gray-100">
              Orijinal İçerik
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {result.entityType === 'ExamQuestion' && result.flaggedContent && (
              <>
                <div>
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-2">
                    Soru Metni
                  </p>
                  <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                    {contentSnippet}
                  </p>
                  {contentSnippet.length < (result.flaggedContent || '').length && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                      ... ({(result.flaggedContent || '').length} karakter toplam)
                    </p>
                  )}
                </div>
              </>
            )}

            {result.entityType === 'ExamOption' && result.flaggedContent && (
              <div>
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-2">
                  Seçenek Metni
                </p>
                <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                  {contentSnippet}
                </p>
              </div>
            )}

            {/* İçerik görüntüsü */}
            {result.flaggedContent && result.flaggedContent.includes('data:image') && (
              <div className="mt-4">
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-2">
                  Görüntü
                </p>
                <img
                  src={result.flaggedContent}
                  alt="Bayraklandırılan içerik"
                  className="max-w-sm rounded-lg border border-gray-200 dark:border-gray-700"
                />
              </div>
            )}

            {!result.flaggedContent && (
              <p className="text-sm text-gray-500 dark:text-gray-400">İçerik bulunamadı</p>
            )}
          </CardContent>
        </Card>

        {/* Sağ: Analiz */}
        <div className="space-y-6">
          {/* Kategoriler */}
          <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <CardHeader>
              <CardTitle className="text-lg text-gray-900 dark:text-gray-100">
                Tespit Edilen Kategoriler
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {categories.length > 0 ? (
                categories.map((cat) => (
                  <Badge
                    key={cat}
                    className={CATEGORY_COLORS[cat] || CATEGORY_COLORS.OTHER}
                  >
                    {CATEGORY_LABELS_TR[cat] || cat}
                  </Badge>
                ))
              ) : (
                <p className="text-sm text-gray-500 dark:text-gray-400">Kategori bulunamadı</p>
              )}
            </CardContent>
          </Card>

          {/* Puanlar */}
          {Object.keys(scores).length > 0 && (
            <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
              <CardHeader>
                <CardTitle className="text-lg text-gray-900 dark:text-gray-100">
                  Kategori Puanları
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {Object.entries(scores).map(([cat, score]) => (
                  <div key={cat}>
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-xs font-medium text-gray-700 dark:text-gray-300">
                        {CATEGORY_LABELS_TR[cat] || cat}
                      </p>
                      <p className="text-xs font-semibold text-gray-900 dark:text-gray-100">
                        {(score * 100).toFixed(1)}%
                      </p>
                    </div>
                    <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-amber-400 to-rose-500 transition-all"
                        style={{ width: `${score * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Yasak Kelimeler */}
          {matchedTerms.length > 0 && (
            <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
              <CardHeader>
                <CardTitle className="text-lg text-gray-900 dark:text-gray-100">
                  Eşleşen Yasak Kelimeler
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {matchedTerms.map((term, idx) => (
                  <Badge
                    key={idx}
                    variant="outline"
                    className="bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800"
                  >
                    {term}
                  </Badge>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Claude Reasoning */}
      {result.reasonText && (
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardHeader>
            <CardTitle className="text-lg text-gray-900 dark:text-gray-100">
              Claude Analiz Raporu
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
              {result.reasonText}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Raw Response (collapsed) */}
      {result.rawResponse && (
        <details className="group">
          <summary className="cursor-pointer select-none flex items-center gap-2 p-4 rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
            <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
              Teknik Detaylar (JSON)
            </span>
          </summary>
          <div className="mt-2 p-4 bg-gray-900 dark:bg-gray-950 rounded-lg overflow-x-auto">
            <pre className="text-xs text-gray-100 font-mono">
              {JSON.stringify(result.rawResponse, null, 2)}
            </pre>
          </div>
        </details>
      )}

      {/* Sticky Decision Panel */}
      <div className="sticky bottom-0 left-0 right-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 p-4 flex items-center justify-between gap-4 rounded-t-lg shadow-lg">
        <div>
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
            Bu içerik hakkında karar verin
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Seçiminiz hemen uygulanacak ve eğitici hakkında işlem başlayabilir
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => {
              setDecideAction('approve');
              setDecideOpen(true);
            }}
            disabled={approveMutation.isPending}
            variant="outline"
            className="gap-2 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
          >
            <CheckCircle className="w-4 h-4" />
            Temiz İşaretle
          </Button>
          <Button
            onClick={() => {
              setDecideAction('reject');
              setDecideOpen(true);
            }}
            disabled={rejectMutation.isPending}
            variant="outline"
            className="gap-2 border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-900/20"
          >
            <XCircle className="w-4 h-4" />
            İhlal Onayla
          </Button>
        </div>
      </div>

      {/* Decision Modal */}
      <DecideModal
        isOpen={decideOpen}
        onClose={() => setDecideOpen(false)}
        onSubmit={handleDecide}
        status={decideAction}
        isPending={approveMutation.isPending || rejectMutation.isPending}
      />
    </div>
  );
}
