import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api/apiClient';
import { toast } from 'sonner';
import {
  Mail,
  Loader2,
  Info,
} from 'lucide-react';

const PREFERENCE_FIELDS = [
  {
    key: 'marketing',
    label: 'Pazarlama Mailleri',
    description: 'Kampanya ve duyurular',
  },
  {
    key: 'productUpdates',
    label: 'Yeni Özellik Duyuruları',
    description: 'Ürün güncellemeleri ve yeni özellikleri',
  },
  {
    key: 'weeklyDigest',
    label: 'Haftalık Özet',
    description: 'Haftalık özet ve istatistikler',
  },
  {
    key: 'reviewNotifications',
    label: 'Değerlendirme Bildirimleri',
    description: 'Testlerinize gelen değerlendirmeler',
  },
  {
    key: 'objectionUpdates',
    label: 'İtiraz Güncellemeleri',
    description: 'İtiraz durumu ve yanıtlar',
  },
  {
    key: 'liveSessionInvites',
    label: 'Canlı Sınav Davetleri',
    description: 'Canlı sınava katılım davetleri',
  },
  {
    key: 'refundUpdates',
    label: 'İade Bildirimleri',
    description: 'İade durumu ve işlemleri',
  },
];

export default function EmailPreferences() {
  const queryClient = useQueryClient();
  const [preferences, setPreferences] = useState(/** @type {any} */ ({}));
  const [hasChanges, setHasChanges] = useState(false);

  const { data: currentPreferences, isLoading } = useQuery({
    queryKey: ['me', 'email-preferences'],
    queryFn: async () => {
      const { data } = await api.get('/me/email-preferences');
      return data || {};
    },
  });

  useEffect(() => {
    if (currentPreferences) {
      setPreferences(currentPreferences);
    }
  }, [currentPreferences]);

  const updateMutation = useMutation({
    mutationFn: async (/** @type {any} */ body) => {
      const { data } = await api.patch('/me/email-preferences', body);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['me', 'email-preferences'] });
      toast.success('Tercihleriniz kaydedildi');
      setHasChanges(false);
    },
    onError: (error) => {
      toast.error(error.response?.data?.message || 'Kaydedilemedi');
    },
  });

  const handleToggle = (key) => {
    setPreferences((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
    setHasChanges(true);
  };

  const handleSave = () => {
    updateMutation.mutate(preferences);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400 dark:text-gray-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center">
          <Mail className="w-5 h-5 text-blue-600 dark:text-blue-400" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Email Tercihleri</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Hangi mailleri almak istediğinizi kontrol edin</p>
        </div>
      </div>

      {/* Critical info */}
      <div className="flex items-start gap-3 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
        <Info className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-blue-700 dark:text-blue-300 space-y-1">
          <p>
            <strong>Önemli:</strong> Hesap güvenliği, şifre sıfırlama, ödeme ve iade ile ilgili kritik
            mailler bu tercihlerden etkilenmez. Bunlar her zaman gönderilir.
          </p>
        </div>
      </div>

      {/* Preferences list */}
      <div className="space-y-3">
        {PREFERENCE_FIELDS.map((field) => (
          <div
            key={field.key}
            className="p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg flex items-center justify-between hover:border-gray-300 dark:hover:border-gray-600 transition-colors"
          >
            <div className="flex-1">
              <p className="font-medium text-gray-900 dark:text-gray-100">{field.label}</p>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">{field.description}</p>
            </div>

            <button
              onClick={() => handleToggle(field.key)}
              disabled={updateMutation.isPending}
              className={`relative inline-flex h-7 w-14 flex-shrink-0 rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900 ${
                preferences[field.key]
                  ? 'bg-emerald-600 dark:bg-emerald-600'
                  : 'bg-gray-300 dark:bg-gray-600'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
              aria-label={`${field.label} tercihi`}
              aria-pressed={preferences[field.key]}
            >
              <span
                className={`inline-block h-6 w-6 rounded-full bg-white shadow transition-transform ${
                  preferences[field.key] ? 'translate-x-7' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        ))}
      </div>

      {/* Save button */}
      {hasChanges && (
        <div className="sticky bottom-0 p-4 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 rounded-lg flex items-center justify-between">
          <p className="text-sm text-gray-600 dark:text-gray-400">Kaydedilmemiş değişiklikler var</p>
          <button
            onClick={handleSave}
            disabled={updateMutation.isPending}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-600 dark:hover:bg-indigo-700 text-white rounded-lg disabled:opacity-50 flex items-center gap-2"
          >
            {updateMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            Kaydet
          </button>
        </div>
      )}

      {/* Legend */}
      <div className="mt-8 p-4 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg space-y-2">
        <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase">İletişim Türleri</p>
        <div className="text-xs text-gray-600 dark:text-gray-400 space-y-1">
          <div>
            <span className="font-medium">Kritik Mailler:</span> Hesap güvenliği, şifre sıfırlama, ödeme
            bildirimleri. Kapatılamaz.
          </div>
          <div>
            <span className="font-medium">Bildirim Mailleri:</span> İtiraz, iade, canlı sınav davetleri.
            Seçenek: açık/kapalı.
          </div>
          <div>
            <span className="font-medium">Pazarlama Mailleri:</span> Kampanya, duyuru, haftalık özet.
            Tamamen isteğe bağlı.
          </div>
        </div>
      </div>
    </div>
  );
}
