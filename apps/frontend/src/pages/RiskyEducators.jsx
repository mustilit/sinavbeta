import { useState, useMemo } from 'react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import api from '@/lib/api/apiClient';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import {
  RISK_LEVEL_LABELS_TR,
  CATEGORY_LABELS_TR,
  ACTION_TYPE_LABELS_TR,
  RISK_LEVEL_COLORS,
  CATEGORY_COLORS,
} from '@/lib/moderationLabels';
import { adminModeration } from '@/api/dalClient';
import { formatDistanceToNow } from 'date-fns';
import { tr } from 'date-fns/locale';
import {
  AlertTriangle,
  MoreVertical,
  Eye,
  AlertCircle,
  Clock,
  Ban,
  Zap,
} from 'lucide-react';
import { useDebouncedValue } from '@/lib/useDebouncedValue';
import { toast } from 'sonner';

function ActionModal({ isOpen, onClose, educator, onSubmit, isPending }) {
  const [actionType, setActionType] = useState('WARN');
  const [durationDays, setDurationDays] = useState(7);
  const [reason, setReasonText] = useState('');

  const handleSubmit = () => {
    if (reason.trim().length < 20) {
      toast.error('Neden en az 20 karakter olmalıdır');
      return;
    }
    onSubmit({
      educatorId: educator.id,
      actionType,
      durationDays: actionType === 'WARN' ? undefined : durationDays,
      reason: reason.trim(),
    });
    setReasonText('');
    setActionType('WARN');
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Eğitici Aksiyonu</DialogTitle>
          <DialogDescription>
            {educator?.username} ({educator?.email}) için aksiyon belirleyin
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="action-type" className="text-sm font-medium">
              Aksiyon Türü
            </Label>
            <Select value={actionType} onValueChange={setActionType}>
              <SelectTrigger id="action-type" className="mt-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="WARN">Uyarı</SelectItem>
                <SelectItem value="ACCOUNT_SUSPENDED">Askıya Al</SelectItem>
                <SelectItem value="ACCOUNT_BANNED">Banla</SelectItem>
                <SelectItem value="ESCALATED_TO_ADMIN">Yönetime İlet</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {(actionType === 'ACCOUNT_SUSPENDED') && (
            <div>
              <Label htmlFor="duration-days" className="text-sm font-medium">
                Süre (Gün)
              </Label>
              <Input
                id="duration-days"
                type="number"
                min="1"
                max="365"
                value={durationDays}
                onChange={(e) => setDurationDays(Number(e.target.value) || 7)}
                className="mt-1.5"
              />
            </div>
          )}

          <div>
            <Label htmlFor="reason" className="text-sm font-medium">
              Neden (min. 20 karakter)
            </Label>
            <textarea
              id="reason"
              value={reason}
              onChange={(e) => setReasonText(e.target.value)}
              placeholder="Bu aksiyonun nedenini açıklayın..."
              className="w-full mt-1.5 px-3 py-2 border rounded-md text-sm
                         bg-white dark:bg-gray-800
                         text-gray-900 dark:text-gray-100
                         border-gray-200 dark:border-gray-700
                         focus:outline-none focus:ring-2 focus:ring-indigo-500"
              rows={4}
            />
            <p className="text-xs text-slate-500 dark:text-gray-500 mt-1">
              {reason.trim().length} / 20 karakter minimum
            </p>
          </div>
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
            {isPending ? 'Uygulanıyor…' : 'Uygula'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function RiskyEducators() {
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebouncedValue(searchQuery, 300);
  const [selectedRiskLevels, setSelectedRiskLevels] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [sortBy, setSortBy] = useState('risk'); // risk | violation | date
  const [actionModalOpen, setActionModalOpen] = useState(false);
  const [selectedEducator, setSelectedEducator] = useState(null);
  const queryClient = useQueryClient();

  // KPI cards — frontend'de client-side toplama (MVP)
  const {
    data: kpiData,
    isLoading: kpiLoading,
  } = useInfiniteQuery({
    queryKey: ['adminModeration', 'riskyEducators', 'all'],
    queryFn: ({ pageParam }) =>
      adminModeration.listRiskyEducators({
        cursor: pageParam,
        limit: 100,
      }),
    initialPageParam: null,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    staleTime: 60_000,
  });

  // Main list dengan filters
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
  } = useInfiniteQuery({
    queryKey: ['adminModeration', 'riskyEducators', selectedRiskLevels, selectedCategory, debouncedSearch, sortBy],
    queryFn: ({ pageParam }) =>
      adminModeration.listRiskyEducators({
        cursor: pageParam,
        limit: 20,
        riskLevel: selectedRiskLevels.length > 0 ? selectedRiskLevels : undefined,
        category: selectedCategory && selectedCategory !== 'ALL' ? selectedCategory : undefined,
        q: debouncedSearch || undefined,
      }),
    initialPageParam: null,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    staleTime: 30_000,
  });

  // Action mutation
  const actionMutation = useMutation({
    mutationFn: ({ educatorId, actionType, durationDays, reason }) =>
      adminModeration.applyAction(educatorId, { actionType, durationDays, reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminModeration', 'riskyEducators'] });
      toast.success('Aksiyon uygulandı');
      setActionModalOpen(false);
    },
    onError: (err) => {
      toast.error(err?.response?.data?.message || 'Aksiyon uygulanamadı');
    },
  });

  // Compute KPI cards
  const kpiItems = kpiData?.pages.flatMap((p) => p.items) ?? [];
  const kpiStats = useMemo(() => {
    return {
      warned: kpiItems.filter(e => e.riskLevel === 'MEDIUM').length,
      suspended: kpiItems.filter(e => e.suspendedUntil && new Date(e.suspendedUntil) > new Date()).length,
      banned: kpiItems.filter(e => e.isBanned).length,
      recentViolations: kpiItems.filter(e => {
        const lastViolation = e.lastViolationAt ? new Date(e.lastViolationAt) : null;
        if (!lastViolation) return false;
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        return lastViolation > sevenDaysAgo;
      }).length,
    };
  }, [kpiItems]);

  const items = data?.pages.flatMap((p) => p.items) ?? [];

  // Apply frontend sorting
  const sortedItems = useMemo(() => {
    const copy = [...items];
    if (sortBy === 'risk') {
      const levels = { CRITICAL: 3, HIGH: 2, MEDIUM: 1, LOW: 0 };
      copy.sort((a, b) => (levels[b.riskLevel] ?? 0) - (levels[a.riskLevel] ?? 0));
    } else if (sortBy === 'violation') {
      copy.sort((a, b) => (b.violationCount ?? 0) - (a.violationCount ?? 0));
    } else if (sortBy === 'date') {
      copy.sort((a, b) => new Date(b.lastViolationAt || 0) - new Date(a.lastViolationAt || 0));
    }
    return copy;
  }, [items, sortBy]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-gray-50">Riskli Eğiticiler</h1>
          <p className="text-slate-500 dark:text-gray-400 mt-2">İhlal riski altındaki eğiticiler</p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900 dark:text-gray-50">Riskli Eğiticiler</h1>
        <p className="text-slate-500 dark:text-gray-400 mt-2">İhlal riski altındaki eğiticileri yönetin</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-slate-500 dark:text-gray-500">Uyarı Altında</p>
            <p className="text-2xl font-bold text-amber-700 dark:text-amber-300 mt-1">
              {kpiStats.warned}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-slate-500 dark:text-gray-500">Askıya Alınmış</p>
            <p className="text-2xl font-bold text-orange-700 dark:text-orange-300 mt-1">
              {kpiStats.suspended}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-slate-500 dark:text-gray-500">Yasaklanmış</p>
            <p className="text-2xl font-bold text-rose-700 dark:text-rose-300 mt-1">
              {kpiStats.banned}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-slate-500 dark:text-gray-500">Son 7 Gün İhlal</p>
            <p className="text-2xl font-bold text-indigo-700 dark:text-indigo-300 mt-1">
              {kpiStats.recentViolations}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filter Bar */}
      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <Label htmlFor="search" className="text-xs font-medium">
                Arama (E-posta / Kullanıcı Adı)
              </Label>
              <Input
                id="search"
                placeholder="Ara..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="mt-1.5"
              />
            </div>

            <div>
              <Label htmlFor="risk-levels" className="text-xs font-medium">
                Risk Seviyeleri
              </Label>
              <Select
                value={selectedRiskLevels.length > 0 ? selectedRiskLevels.join(',') : 'ALL'}
                onValueChange={(v) => setSelectedRiskLevels(!v || v === 'ALL' ? [] : v.split(','))}
              >
                <SelectTrigger id="risk-levels" className="mt-1.5">
                  <SelectValue placeholder="Tümü" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Tümü</SelectItem>
                  {['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((level) => (
                    <SelectItem key={level} value={level}>
                      {RISK_LEVEL_LABELS_TR[level]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="category" className="text-xs font-medium">
                Kategori
              </Label>
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger id="category" className="mt-1.5">
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
              <Label htmlFor="sort" className="text-xs font-medium">
                Sıralama
              </Label>
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger id="sort" className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="risk">Risk Skoru (Yüksek → Düşük)</SelectItem>
                  <SelectItem value="violation">Toplam İhlal (Çok → Az)</SelectItem>
                  <SelectItem value="date">Son İhlal (En Yeni)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Results Table */}
      {sortedItems.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <AlertTriangle className="w-12 h-12 text-emerald-600 mx-auto mb-3" />
            <p className="text-slate-600 dark:text-gray-400">
              Aktif risk altında eğitici yok — sistem temiz görünüyor!
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">Riskli eğiticiler listesi</caption>
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th scope="col" className="px-4 py-3 text-left font-semibold text-slate-900 dark:text-gray-100">
                  Eğitici
                </th>
                <th scope="col" className="px-4 py-3 text-left font-semibold text-slate-900 dark:text-gray-100">
                  Risk
                </th>
                <th scope="col" className="px-4 py-3 text-center font-semibold text-slate-900 dark:text-gray-100">
                  Skor
                </th>
                <th scope="col" className="px-4 py-3 text-center font-semibold text-slate-900 dark:text-gray-100">
                  Toplam İhlal
                </th>
                <th scope="col" className="px-4 py-3 text-center font-semibold text-slate-900 dark:text-gray-100">
                  Açık
                </th>
                <th scope="col" className="px-4 py-3 text-center font-semibold text-slate-900 dark:text-gray-100">
                  Son İhlal
                </th>
                <th scope="col" className="px-4 py-3 text-left font-semibold text-slate-900 dark:text-gray-100">
                  Durum
                </th>
                <th scope="col" className="px-4 py-3 text-right font-semibold text-slate-900 dark:text-gray-100">
                  Aksiyonlar
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedItems.map((educator) => {
                const isHighRisk = educator.riskLevel === 'CRITICAL' || educator.riskLevel === 'HIGH';
                const isSuspended = educator.suspendedUntil && new Date(educator.suspendedUntil) > new Date();
                const rowClass = isHighRisk ? 'bg-white dark:bg-gray-800 border-l-4 border-l-rose-500' : '';
                return (
                  <tr
                    key={educator.id}
                    className={`border-b border-gray-200 dark:border-gray-700 ${rowClass} ${
                      isHighRisk && !isSuspended ? 'animate-pulse-light' : ''
                    }`}
                    aria-label={`Eğitici: ${educator.username}, risk seviyesi: ${RISK_LEVEL_LABELS_TR[educator.riskLevel]}, skor: ${Math.round(educator.computedScore)}`}
                  >
                    {/* Eğitici */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {educator.profileImageUrl ? (
                          <img
                            src={educator.profileImageUrl}
                            alt={educator.username}
                            className="w-8 h-8 rounded-full object-cover"
                          />
                        ) : (
                          <div className="w-8 h-8 bg-gradient-to-br from-slate-100 to-slate-200 dark:from-gray-700 dark:to-gray-600 rounded-full flex items-center justify-center">
                            <span className="text-xs font-semibold text-slate-600 dark:text-gray-200">
                              {educator.username[0]?.toUpperCase()}
                            </span>
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="font-medium text-slate-900 dark:text-gray-100 truncate">
                            {educator.username}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-gray-500 truncate">
                            {educator.email}
                          </p>
                        </div>
                      </div>
                    </td>

                    {/* Risk Level */}
                    <td className="px-4 py-3">
                      <Badge className={RISK_LEVEL_COLORS[educator.riskLevel] || 'bg-gray-100 text-gray-700'}>
                        {RISK_LEVEL_LABELS_TR[educator.riskLevel] || educator.riskLevel}
                      </Badge>
                    </td>

                    {/* Score Progress */}
                    <td className="px-4 py-3 text-center">
                      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
                        <div
                          className={`h-full transition-all ${
                            educator.computedScore >= 75 ? 'bg-rose-600' :
                            educator.computedScore >= 50 ? 'bg-orange-600' :
                            educator.computedScore >= 25 ? 'bg-amber-600' :
                            'bg-slate-600'
                          }`}
                          style={{ width: `${Math.min(educator.computedScore, 100)}%` }}
                        />
                      </div>
                      <p className="text-xs font-medium text-slate-700 dark:text-gray-300 mt-1">
                        {Math.round(educator.computedScore)}
                      </p>
                    </td>

                    {/* Total Violations */}
                    <td className="px-4 py-3 text-center">
                      <p className="font-semibold text-slate-900 dark:text-gray-100">
                        {educator.violationCount ?? 0}
                      </p>
                    </td>

                    {/* Open Violations */}
                    <td className="px-4 py-3 text-center">
                      {(educator.openViolations ?? 0) > 0 ? (
                        <p className="font-semibold text-rose-600 dark:text-rose-400">
                          {educator.openViolations}
                        </p>
                      ) : (
                        <p className="text-xs text-slate-500 dark:text-gray-500">—</p>
                      )}
                    </td>

                    {/* Last Violation */}
                    <td className="px-4 py-3 text-center">
                      {educator.lastViolationAt ? (
                        <p className="text-xs text-slate-600 dark:text-gray-400">
                          {formatDistanceToNow(new Date(educator.lastViolationAt), { locale: tr, addSuffix: true })}
                        </p>
                      ) : (
                        <p className="text-xs text-slate-500 dark:text-gray-500">—</p>
                      )}
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3">
                      {educator.isBanned ? (
                        <Badge variant="outline" className="bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300">
                          <Ban className="w-3 h-3 mr-1" />
                          Yasaklı
                        </Badge>
                      ) : isSuspended ? (
                        <Badge variant="outline" className="bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300">
                          <Clock className="w-3 h-3 mr-1" />
                          Askıda
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-slate-100 text-slate-700 dark:bg-slate-900/30 dark:text-slate-300">
                          Aktif
                        </Badge>
                      )}
                    </td>

                    {/* Quick Actions */}
                    <td className="px-4 py-3 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label={`${educator.username} için aksiyonlar`}
                          >
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <Link to={`/yonetim/moderasyon/eğitici/${educator.id}`}>
                              <Eye className="w-4 h-4 mr-2" />
                              Detayı Gör
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => {
                              setSelectedEducator(educator);
                              setActionModalOpen(true);
                            }}
                          >
                            <AlertCircle className="w-4 h-4 mr-2" />
                            Uyar
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => {
                              setSelectedEducator(educator);
                              setActionModalOpen(true);
                            }}
                          >
                            <Clock className="w-4 h-4 mr-2" />
                            Askıya Al
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => {
                              setSelectedEducator(educator);
                              setActionModalOpen(true);
                            }}
                          >
                            <Ban className="w-4 h-4 mr-2" />
                            Banla
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
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

      {/* Action Modal */}
      {selectedEducator && (
        <ActionModal
          isOpen={actionModalOpen}
          onClose={() => {
            setActionModalOpen(false);
            setSelectedEducator(null);
          }}
          educator={selectedEducator}
          onSubmit={(payload) => actionMutation.mutate(payload)}
          isPending={actionMutation.isPending}
        />
      )}
    </div>
  );
}
