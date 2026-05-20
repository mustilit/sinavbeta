import { useState } from 'react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api/apiClient';
import { toast } from 'sonner';
import {
  Plus,
  Trash2,
  Mail,
  Loader2,
  Search,
} from 'lucide-react';
import * as Dialog from '@radix-ui/react-dialog';

const SUPPRESSION_REASONS = {
  HARD_BOUNCE: 'Kalıcı Geri Dönüş',
  REPEATED_SOFT_BOUNCE: 'Tekrarlayan Geçici Geri Dönüş',
  SPAM_COMPLAINT: 'Spam Şikayet',
  UNSUBSCRIBE: 'Abonelikten Çıkış',
  MANUAL_BLOCK: 'Manuel Engelleme',
  INVALID_ADDRESS: 'Geçersiz Adres',
};

function AddSuppressionForm({ onSubmit, isPending }) {
  const [form, setForm] = useState({
    email: '',
    reason: 'MANUAL_BLOCK',
    note: '',
    expiresAt: '',
  });

  const [errors, setErrors] = useState({});

  const validate = () => {
    const newErrors = {};
    if (!form.email?.trim()) newErrors.email = 'Email gerekli';
    else if (!form.email.includes('@')) newErrors.email = 'Geçerli email girin';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = () => {
    if (validate()) {
      const body = {
        email: form.email.trim(),
        reason: form.reason,
        ...(form.note && { note: form.note.trim() }),
        ...(form.expiresAt && { expiresAt: form.expiresAt }),
      };
      onSubmit(body);
      setForm({ email: '', reason: 'MANUAL_BLOCK', note: '', expiresAt: '' });
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="suppression-email" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          Email Adresi
        </label>
        <input
          id="suppression-email"
          type="email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          placeholder="user@example.com"
          aria-invalid={Boolean(errors.email)}
          className="mt-1 w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        {errors.email && <p className="text-xs text-red-600 dark:text-red-400 mt-1">{errors.email}</p>}
      </div>

      <div>
        <label htmlFor="suppression-reason" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          Sebep
        </label>
        <select
          id="suppression-reason"
          value={form.reason}
          onChange={(e) => setForm({ ...form, reason: e.target.value })}
          className="mt-1 w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          {Object.entries(SUPPRESSION_REASONS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="suppression-note" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          Not (isteğe bağlı)
        </label>
        <input
          id="suppression-note"
          type="text"
          value={form.note}
          onChange={(e) => setForm({ ...form, note: e.target.value })}
          placeholder="Örn: Kullanıcı talebi"
          className="mt-1 w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      <div>
        <label htmlFor="suppression-expires" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          Bitiş Tarihi (isteğe bağlı)
        </label>
        <input
          id="suppression-expires"
          type="date"
          value={form.expiresAt}
          onChange={(e) => setForm({ ...form, expiresAt: e.target.value })}
          className="mt-1 w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      <div className="flex gap-2 justify-end pt-4 border-t border-gray-200 dark:border-gray-700">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={isPending || !form.email.trim()}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-600 dark:hover:bg-indigo-700 text-white rounded-lg disabled:opacity-50 flex items-center gap-2"
        >
          {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
          Ekle
        </button>
      </div>
    </div>
  );
}

export default function EmailSuppressions() {
  const queryClient = useQueryClient();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [searchText, setSearchText] = useState('');

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
  } = useInfiniteQuery({
    queryKey: ['email', 'suppressions', searchText],
    queryFn: async ({ pageParam }) => {
      const params = {
        ...(searchText && { search: searchText }),
        ...(pageParam?.cursorId && { cursorId: pageParam.cursorId }),
        limit: 20,
      };

      Object.keys(params).forEach((k) => params[k] === undefined && delete params[k]);

      const { data } = await api.get('/admin/email/suppressions', { params });
      return data;
    },
    initialPageParam: null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    staleTime: 30_000,
  });

  const addMutation = useMutation({
    mutationFn: async (body) => {
      const { data } = await api.post('/admin/email/suppressions', body);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email', 'suppressions'] });
      toast.success('Engelleme eklendi');
      setIsCreateOpen(false);
    },
    onError: (error) => {
      toast.error(error.response?.data?.message || 'Eklenemedi');
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (id) => {
      await api.delete(`/admin/email/suppressions/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email', 'suppressions'] });
      toast.success('Engelleme kaldırıldı');
    },
    onError: (error) => {
      toast.error(error.response?.data?.message || 'Kaldırılamadı');
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
        <p className="text-red-700 dark:text-red-300">Veriler yüklenemedi</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-red-50 dark:bg-red-900/30 flex items-center justify-center">
            <Mail className="w-5 h-5 text-red-600 dark:text-red-400" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Email Engelleri</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Engellenen email adreslerini yönetin</p>
          </div>
        </div>

        <Dialog.Root open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <Dialog.Trigger asChild>
            <button className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-600 dark:hover:bg-indigo-700 text-white rounded-lg flex items-center gap-2">
              <Plus className="w-4 h-4" />
              Yeni Engelleme
            </button>
          </Dialog.Trigger>
          <Dialog.Content className="max-w-md bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
            <Dialog.Title className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
              Email Engelle
            </Dialog.Title>
            <AddSuppressionForm onSubmit={(b) => addMutation.mutate(b)} isPending={addMutation.isPending} />
          </Dialog.Content>
        </Dialog.Root>
      </div>

      {/* Search */}
      <div className="flex items-center gap-2 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700">
        <Search className="w-4 h-4 text-gray-400 dark:text-gray-500" />
        <input
          type="text"
          placeholder="Email ara..."
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          className="flex-1 bg-transparent text-gray-900 dark:text-gray-100 focus:outline-none text-sm"
        />
      </div>

      {/* Suppressions list */}
      {items.length === 0 ? (
        <div className="text-center py-12">
          <Mail className="w-12 h-12 text-gray-300 dark:text-gray-700 mx-auto mb-3" />
          <p className="text-gray-600 dark:text-gray-400">
            {searchText ? 'Sonuç bulunamadı' : 'Henüz engelleme eklenmemiş'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((suppression) => (
            <div
              key={suppression.id}
              className="p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg flex items-center justify-between"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <p className="font-mono text-sm text-gray-900 dark:text-gray-100 truncate">
                    {suppression.email}
                  </p>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                    {SUPPRESSION_REASONS[suppression.reason] || suppression.reason}
                  </span>
                </div>
                <div className="flex items-center gap-3 flex-wrap text-xs text-gray-500 dark:text-gray-400">
                  <span>{new Date(suppression.createdAt).toLocaleString('tr-TR')}</span>
                  {suppression.expiresAt && (
                    <span>
                      Bitiş: {new Date(suppression.expiresAt).toLocaleString('tr-TR')}
                    </span>
                  )}
                  {suppression.note && <span>— {suppression.note}</span>}
                </div>
              </div>

              <button
                onClick={() => removeMutation.mutate(suppression.id)}
                disabled={removeMutation.isPending}
                className="p-2 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors disabled:opacity-50 flex-shrink-0"
                aria-label="Kaldır"
              >
                <Trash2 className="w-4 h-4 text-gray-600 dark:text-gray-400" />
              </button>
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
