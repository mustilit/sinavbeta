import { useState, useEffect } from 'react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import {
  CATEGORY_LABELS_TR,
  CATEGORY_COLORS,
} from '@/lib/moderationLabels';
import { adminModeration } from '@/api/dalClient';
import { useDebouncedValue } from '@/lib/useDebouncedValue';
import { formatDistanceToNow } from 'date-fns';
import { tr } from 'date-fns/locale';
import { Plus, Trash2, Edit2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

function CreateTermModal({ isOpen, onClose, onSubmit, isPending }) {
  const [term, setTerm] = useState('');
  const [pattern, setPattern] = useState('');
  const [category, setCategory] = useState('PROFANITY');
  const [severity, setSeverity] = useState(3);
  const [isActive, setIsActive] = useState(true);

  const handleSubmit = () => {
    if (!term.trim()) {
      toast.error('Terim gereklidir');
      return;
    }
    if (term.trim().length < 2) {
      toast.error('Terim en az 2 karakter olmalıdır');
      return;
    }
    // Modal'ı parent (onSuccess) kapatır — duplicate hatasında açık kalsın
    onSubmit({ term: term.trim(), pattern: pattern.trim() || null, category, severity: Number(severity), isActive });
  };

  // Modal her açıldığında alanlar sıfırlanır
  useEffect(() => {
    if (isOpen) {
      setTerm('');
      setPattern('');
      setCategory('PROFANITY');
      setSeverity(3);
      setIsActive(true);
    }
  }, [isOpen]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Yeni Yasak Kelime Ekle</DialogTitle>
          <DialogDescription>
            Sistem tarafından otomatik olarak algılanacak kelime veya deseni tanımlayın.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="term" className="text-sm font-medium">
              Kelime / Terim
            </Label>
            <Input
              id="term"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="Yasak edilen kelime"
              className="mt-1.5"
            />
          </div>

          <div>
            <Label htmlFor="pattern" className="text-sm font-medium">
              Regex Deseni (İsteğe Bağlı)
            </Label>
            <Input
              id="pattern"
              value={pattern}
              onChange={(e) => setPattern(e.target.value)}
              placeholder="Örn: ^ad.*min$"
              className="mt-1.5 text-xs font-mono"
            />
            <p className="text-xs text-slate-500 dark:text-gray-500 mt-1">
              Regex desteği — boş bırakılırsa kesin eşleşme
            </p>
          </div>

          <div>
            <Label htmlFor="category" className="text-sm font-medium">
              Kategori
            </Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger id="category" className="mt-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(CATEGORY_LABELS_TR).map(([key, label]) => (
                  <SelectItem key={key} value={key}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="severity" className="text-sm font-medium">
              Şiddet Seviyesi: {severity}
            </Label>
            <input
              id="severity"
              type="range"
              min="1"
              max="5"
              value={severity}
              onChange={(e) => setSeverity(e.target.value)}
              className="w-full mt-1.5"
            />
            <div className="flex gap-1 mt-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className={`flex-1 h-2 rounded ${
                    i < severity ? 'bg-rose-600' : 'bg-gray-200 dark:bg-gray-700'
                  }`}
                />
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Switch
              id="is-active"
              checked={isActive}
              onCheckedChange={setIsActive}
            />
            <Label htmlFor="is-active" className="text-sm font-medium cursor-pointer">
              Aktif
            </Label>
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
            {isPending ? 'Ekleniyor…' : 'Ekle'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function BlockedTerms() {
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [activeFilter, setActiveFilter] = useState('all'); // all | active | inactive
  const [termFilter, setTermFilter] = useState('');
  const debouncedTerm = useDebouncedValue(termFilter, 300);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTerm, setEditingTerm] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const queryClient = useQueryClient();

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
  } = useInfiniteQuery({
    queryKey: ['adminModeration', 'blockedTerms', categoryFilter, activeFilter, debouncedTerm],
    queryFn: ({ pageParam }) =>
      adminModeration.listBlockedTerms({
        cursor: pageParam,
        limit: 50,
        category: categoryFilter && categoryFilter !== 'ALL' ? categoryFilter : undefined,
        isActive: activeFilter === 'active' ? true : activeFilter === 'inactive' ? false : undefined,
        term: debouncedTerm.trim() || undefined,
      }),
    initialPageParam: null,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    staleTime: 60_000,
  });

  const createMutation = useMutation({
    mutationFn: (payload) => adminModeration.createBlockedTerm(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminModeration', 'blockedTerms'] });
      toast.success('Yasak kelime eklendi');
      setModalOpen(false);
    },
    onError: (err) => {
      const status = err?.response?.status ?? err?.status;
      const data = err?.response?.data ?? err?.data;
      const code = data?.error?.code ?? data?.code;
      const msg = data?.error?.message ?? data?.message ?? err?.message;
      if (status === 409 || code === 'DUPLICATE_BLOCKED_TERM') {
        toast.warning('Bu kelime zaten kayıtlı', {
          description: 'Aynı terim sistemde mevcut, yeniden eklenmedi.',
          duration: 5000,
        });
      } else {
        toast.error(msg || 'Eklenemiyor');
      }
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, partial }) => adminModeration.updateBlockedTerm(id, partial),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminModeration', 'blockedTerms'] });
      toast.success('Güncellendi');
      setEditingTerm(null);
      setEditForm(null);
    },
    onError: (err) => {
      toast.error(err?.response?.data?.message || 'Güncellenemedi');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => adminModeration.deleteBlockedTerm(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminModeration', 'blockedTerms'] });
      toast.success('Silindi');
    },
    onError: (err) => {
      toast.error(err?.response?.data?.message || 'Silinemedi');
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 dark:text-gray-50">Yasak Kelimeler</h1>
            <p className="text-slate-500 dark:text-gray-400 mt-2">Otomatik moderasyon için kelime/desen listesi</p>
          </div>
          <Button className="bg-indigo-600 hover:bg-indigo-700" disabled>
            <Plus className="w-4 h-4 mr-2" />
            Yeni Kelime
          </Button>
        </div>
        <div className="space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16" />
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
        <p className="text-slate-600 dark:text-gray-400 mt-2">Yasak kelimeler yüklenemedi.</p>
      </div>
    );
  }

  const items = data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-gray-50">Yasak Kelimeler</h1>
          <p className="text-slate-500 dark:text-gray-400 mt-2">{items.length} kelime tanımlı</p>
        </div>
        <Button
          onClick={() => setModalOpen(true)}
          className="bg-indigo-600 hover:bg-indigo-700"
        >
          <Plus className="w-4 h-4 mr-2" />
          Yeni Kelime
        </Button>
      </div>

      {/* Filter Bar */}
      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="filter-term" className="text-xs font-medium">
                Terim
              </Label>
              <Input
                id="filter-term"
                type="search"
                placeholder="Terim ara..."
                value={termFilter}
                onChange={(e) => setTermFilter(e.target.value)}
                className="mt-1.5"
                autoComplete="off"
              />
            </div>

            <div>
              <Label htmlFor="filter-category" className="text-xs font-medium">
                Kategori
              </Label>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
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
              <Label htmlFor="filter-active" className="text-xs font-medium">
                Durum
              </Label>
              <Select value={activeFilter} onValueChange={setActiveFilter}>
                <SelectTrigger id="filter-active" className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tümü</SelectItem>
                  <SelectItem value="active">Aktif</SelectItem>
                  <SelectItem value="inactive">Pasif</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Terms Table */}
      {items.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <AlertTriangle className="w-12 h-12 text-slate-400 mx-auto mb-3" />
            <p className="text-slate-600 dark:text-gray-400">Tanımlanmış kelime yok.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">Yasak kelimeler listesi</caption>
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th scope="col" className="px-4 py-3 text-left font-semibold text-slate-900 dark:text-gray-100">
                  Terim
                </th>
                <th scope="col" className="px-4 py-3 text-left font-semibold text-slate-900 dark:text-gray-100">
                  Desen
                </th>
                <th scope="col" className="px-4 py-3 text-left font-semibold text-slate-900 dark:text-gray-100">
                  Kategori
                </th>
                <th scope="col" className="px-4 py-3 text-center font-semibold text-slate-900 dark:text-gray-100">
                  Şiddet
                </th>
                <th scope="col" className="px-4 py-3 text-left font-semibold text-slate-900 dark:text-gray-100">
                  Durum
                </th>
                <th scope="col" className="px-4 py-3 text-left font-semibold text-slate-900 dark:text-gray-100">
                  Oluşturulma
                </th>
                <th scope="col" className="px-4 py-3 text-right font-semibold text-slate-900 dark:text-gray-100">
                  İşlem
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((term) => (
                <tr
                  key={term.id}
                  className="border-b border-gray-200 dark:border-gray-700 hover:bg-slate-50 dark:hover:bg-gray-800/50 transition-colors"
                >
                  <td className="px-4 py-3 font-mono text-xs font-medium text-slate-900 dark:text-gray-100">
                    {editingTerm?.id === term.id ? (
                      <Input
                        value={editForm.term}
                        onChange={(e) => setEditForm({ ...editForm, term: e.target.value })}
                        className="text-xs"
                      />
                    ) : (
                      term.term
                    )}
                  </td>

                  <td className="px-4 py-3 text-xs font-mono text-slate-500 dark:text-gray-400">
                    {editingTerm?.id === term.id ? (
                      <Input
                        value={editForm.pattern || ''}
                        onChange={(e) => setEditForm({ ...editForm, pattern: e.target.value })}
                        className="text-xs"
                        placeholder="Desen (opsiyonel)"
                      />
                    ) : (
                      term.pattern || '—'
                    )}
                  </td>

                  <td className="px-4 py-3">
                    {editingTerm?.id === term.id ? (
                      <Select value={editForm.category} onValueChange={(v) => setEditForm({ ...editForm, category: v })}>
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(CATEGORY_LABELS_TR).map(([key, label]) => (
                            <SelectItem key={key} value={key}>
                              {label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Badge className={CATEGORY_COLORS[term.category] || 'bg-gray-100 text-gray-700'}>
                        {CATEGORY_LABELS_TR[term.category] || term.category}
                      </Badge>
                    )}
                  </td>

                  <td className="px-4 py-3 text-center">
                    {editingTerm?.id === term.id ? (
                      <input
                        type="number"
                        min="1"
                        max="5"
                        value={editForm.severity}
                        onChange={(e) => setEditForm({ ...editForm, severity: Number(e.target.value) })}
                        className="w-12 h-8 text-center border rounded text-xs
                                 bg-white dark:bg-gray-800
                                 border-gray-200 dark:border-gray-700"
                      />
                    ) : (
                      <div className="flex gap-0.5 justify-center">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <div
                            key={i}
                            className={`w-1.5 h-1.5 rounded-full ${
                              i < term.severity ? 'bg-rose-600' : 'bg-gray-300 dark:bg-gray-600'
                            }`}
                          />
                        ))}
                      </div>
                    )}
                  </td>

                  <td className="px-4 py-3">
                    {editingTerm?.id === term.id ? (
                      <Switch
                        checked={editForm.isActive}
                        onCheckedChange={(checked) => setEditForm({ ...editForm, isActive: checked })}
                      />
                    ) : (
                      <Badge variant={term.isActive ? 'default' : 'outline'}>
                        {term.isActive ? 'Aktif' : 'Pasif'}
                      </Badge>
                    )}
                  </td>

                  <td className="px-4 py-3 text-xs text-slate-500 dark:text-gray-500">
                    {formatDistanceToNow(new Date(term.createdAt), { locale: tr, addSuffix: true })}
                  </td>

                  <td className="px-4 py-3 text-right">
                    {editingTerm?.id === term.id ? (
                      <div className="flex gap-2 justify-end">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setEditingTerm(null)}
                          disabled={updateMutation.isPending}
                        >
                          İptal
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => updateMutation.mutate({ id: term.id, partial: editForm })}
                          disabled={updateMutation.isPending}
                          className="bg-indigo-600 hover:bg-indigo-700"
                        >
                          Kaydet
                        </Button>
                      </div>
                    ) : (
                      <div className="flex gap-2 justify-end">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setEditingTerm(term);
                            setEditForm(term);
                          }}
                          aria-label={`${term.term} kelimesini düzenle`}
                        >
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => deleteMutation.mutate(term.id)}
                          disabled={deleteMutation.isPending}
                          aria-label={`${term.term} kelimesini sil`}
                          className="text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-900/20"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
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

      {/* Create Modal */}
      <CreateTermModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSubmit={(payload) => createMutation.mutate(payload)}
        isPending={createMutation.isPending}
      />
    </div>
  );
}
