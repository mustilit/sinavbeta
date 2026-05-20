import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api/apiClient';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  CATEGORY_LABELS_TR,
  MODERATION_STATUS_LABELS_TR,
  PROVIDER_LABELS_TR,
  MODERATION_STATUS_COLORS,
  CATEGORY_COLORS,
} from '@/lib/moderationLabels';
import { adminModeration } from '@/api/dalClient';
import { formatDistanceToNow } from 'date-fns';
import { tr } from 'date-fns/locale';
import { AlertTriangle, CheckCircle, XCircle } from 'lucide-react';
import { useDebouncedValue } from '@/lib/useDebouncedValue';
import { toast } from 'sonner';

function DecideModal({ isOpen, onClose, onSubmit, status }) {
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
            <Label htmlFor="review-note" className="text-sm font-medium">
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
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <Button variant="outline" onClick={onClose}>
            İptal
          </Button>
          <Button
            onClick={handleSubmit}
            className={isApprove ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'}
          >
            {isApprove ? 'Onayla (Temiz)' : 'Onayla (İhlal)'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function ModerationQueue() {
  const navigate = useNavigate();
  const [category, setCategory] = useState('ALL');
  const [searchEmail, setSearchEmail] = useState('');
  const debouncedEmail = useDebouncedValue(searchEmail, 300);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [decideOpen, setDecideOpen] = useState(false);
  const [decideAction, setDecideAction] = useState('approve');
  const [decideResultId, setDecideResultId] = useState(null);
  const queryClient = useQueryClient();

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
  } = useInfiniteQuery({
    queryKey: ['adminModeration', 'queue', category, debouncedEmail, dateFrom, dateTo],
    queryFn: ({ pageParam }) =>
      adminModeration.listQueue({
        cursor: pageParam,
        limit: 20,
        category: category && category !== 'ALL' ? category : undefined,
        userId: debouncedEmail || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      }),
    initialPageParam: null,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    staleTime: 60_000,
  });

  const approveMutation = useMutation({
    mutationFn: ({ resultId, note }) => adminModeration.approveResult(resultId, { reviewerNote: note }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminModeration', 'queue'] });
      toast.success('İçerik temiz işaretlendi');
      setDecideOpen(false);
    },
    onError: (err) => {
      toast.error(err?.response?.data?.message || 'Onaylama başarısız oldu');
    },
  });

  const rejectMutation = useMutation({
    mutationFn: ({ resultId, note }) => adminModeration.rejectResult(resultId, { reviewerNote: note }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminModeration', 'queue'] });
      toast.success('İhlal onaylandı ve işlem başlatıldı');
      setDecideOpen(false);
    },
    onError: (err) => {
      toast.error(err?.response?.data?.message || 'Reddetme başarısız oldu');
    },
  });

  const handleDecide = (note) => {
    if (decideAction === 'approve') {
      approveMutation.mutate({ resultId: decideResultId, note });
    } else {
      rejectMutation.mutate({ resultId: decideResultId, note });
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-gray-50">İnceleme Kuyruğu</h1>
          <p className="text-slate-500 dark:text-gray-400 mt-2">İçerik moderasyonu için bekleyen kararlar</p>
        </div>
        <div className="space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="text-center py-12">
        <AlertTriangle className="w-12 h-12 text-red-600 mx-auto mb-4" />
        <h2 className="text-lg font-semibold text-slate-900 dark:text-gray-50">Yükleme Başarısız</h2>
        <p className="text-slate-600 dark:text-gray-400 mt-2">Kuyruk verileri yüklenemedi.</p>
      </div>
    );
  }

  const items = data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900 dark:text-gray-50">İnceleme Kuyruğu</h1>
        <p className="text-slate-500 dark:text-gray-400 mt-2">
          {items.length} sonuç — {decideAction === 'approve' ? 'Onay' : 'Reddetme'} bekleniyor
        </p>
      </div>

      {/* Filter Bar */}
      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <Label htmlFor="filter-category" className="text-xs font-medium">
                Kategori
              </Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger id="filter-category" className="mt-1.5">
                  <SelectValue placeholder="Tümü" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Tümü</SelectItem>
                  {Object.entries(CATEGORY_LABELS_TR).map(([key, label]) => (
                    <SelectItem key={key} value={key}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="filter-email" className="text-xs font-medium">
                Eğitici E-posta
              </Label>
              <Input
                id="filter-email"
                type="email"
                placeholder="Ara..."
                value={searchEmail}
                onChange={(e) => setSearchEmail(e.target.value)}
                className="mt-1.5"
              />
            </div>

            <div>
              <Label htmlFor="filter-from" className="text-xs font-medium">
                Tarih Başlangıcı
              </Label>
              <Input
                id="filter-from"
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="mt-1.5"
              />
            </div>

            <div>
              <Label htmlFor="filter-to" className="text-xs font-medium">
                Tarih Bitişi
              </Label>
              <Input
                id="filter-to"
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="mt-1.5"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Results List */}
      {items.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <CheckCircle className="w-12 h-12 text-emerald-600 mx-auto mb-3" />
            <p className="text-slate-600 dark:text-gray-400">İncelenecek içerik yok — sistem temiz görünüyor!</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((result) => (
            <Card key={result.id} className="overflow-hidden hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    {/* Header: Kategori, Status, Tarih */}
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <Badge className={CATEGORY_COLORS[result.categories?.[0]] || 'bg-gray-100 text-gray-700'}>
                        {CATEGORY_LABELS_TR[result.categories?.[0]] || result.categories?.[0]}
                      </Badge>
                      <Badge
                        variant="outline"
                        className={MODERATION_STATUS_COLORS[result.status] || 'bg-slate-100 text-slate-700'}
                      >
                        {MODERATION_STATUS_LABELS_TR[result.status] || result.status}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        {PROVIDER_LABELS_TR[result.provider] || result.provider}
                      </Badge>
                    </div>

                    {/* Eğitici bilgisi */}
                    <p className="text-sm font-medium text-slate-900 dark:text-gray-100 truncate mb-1">
                      {result.user?.email || result.userId}
                    </p>

                    {/* İçerik snippet */}
                    <p className="text-sm text-slate-600 dark:text-gray-400 line-clamp-2 mb-2">
                      {result.flaggedContent ? result.flaggedContent.substring(0, 150) : '(İçerik yok)'}
                    </p>

                    {/* Claude Reasoning (varsa) */}
                    {result.reasonText && (
                      <div className="text-xs bg-amber-50 dark:bg-amber-900/20 text-amber-900 dark:text-amber-200 p-2 rounded mt-2">
                        <strong>Claude Analizi:</strong> {result.reasonText.substring(0, 120)}...
                      </div>
                    )}

                    {/* Tarih */}
                    <p className="text-xs text-slate-500 dark:text-gray-500 mt-2">
                      {formatDistanceToNow(new Date(result.createdAt), { locale: tr, addSuffix: true })}
                    </p>
                  </div>

                  {/* Quick Action Buttons */}
                  <div className="flex gap-2 shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => navigate(`/yonetim/moderasyon/sonuc/${result.id}`)}
                      className="whitespace-nowrap"
                      aria-label={`${result.id} sonucunun detaylarını görüntüle`}
                    >
                      Detay
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setDecideAction('approve');
                        setDecideResultId(result.id);
                        setDecideOpen(true);
                      }}
                      className="whitespace-nowrap"
                      aria-label={`${result.id} içeriğini temiz işaretle`}
                    >
                      <CheckCircle className="w-4 h-4 mr-1" />
                      Temiz
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setDecideAction('reject');
                        setDecideResultId(result.id);
                        setDecideOpen(true);
                      }}
                      className="whitespace-nowrap text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-900/20"
                      aria-label={`${result.id} içeriğinde ihlal onayla`}
                    >
                      <XCircle className="w-4 h-4 mr-1" />
                      İhlal
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Load More */}
      {hasNextPage && (
        <div className="flex justify-center">
          <Button
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
            variant="outline"
          >
            {isFetchingNextPage ? 'Yükleniyor…' : 'Daha Fazla Göster'}
          </Button>
        </div>
      )}

      {/* Decision Modal */}
      <DecideModal
        isOpen={decideOpen}
        onClose={() => setDecideOpen(false)}
        onSubmit={handleDecide}
        status={decideAction}
      />
    </div>
  );
}
