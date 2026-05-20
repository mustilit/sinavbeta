import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import api from '@/lib/api/apiClient';
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react';

const CATEGORY_LABELS = {
  marketing: 'Pazarlama Mailleri',
  productUpdates: 'Yeni Özellik Duyuruları',
  weeklyDigest: 'Haftalık Özet',
  reviewNotifications: 'Değerlendirme Bildirimleri',
  objectionUpdates: 'İtiraz Güncellemeleri',
  liveSessionInvites: 'Canlı Sınav Davetleri',
  refundUpdates: 'İade Bildirimleri',
};

export default function Unsubscribe() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const category = searchParams.get('category');
  const [result, setResult] = useState(null);

  const unsubscribeMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post('/public/email/unsubscribe', {
        token,
        ...(category && { category }),
      });
      return data;
    },
    onSuccess: (data) => {
      setResult({ success: true, data });
    },
    onError: (error) => {
      setResult({
        success: false,
        error: error.response?.data?.message || 'Token geçersiz veya süresi dolmuş',
      });
    },
  });

  useEffect(() => {
    if (token) {
      unsubscribeMutation.mutate();
    } else {
      setResult({
        success: false,
        error: 'Token bulunamadı',
      });
    }
  }, [token]);

  if (!result) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900">
        <div className="max-w-md w-full text-center">
          <Loader2 className="w-12 h-12 animate-spin text-indigo-600 dark:text-indigo-400 mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400">İşlem yapılıyor...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900 px-4">
      <div className="max-w-md w-full">
        {result.success ? (
          <div className="space-y-6">
            {/* Success card */}
            <div className="p-6 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg space-y-4 text-center">
              <div className="flex justify-center">
                <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                  <CheckCircle2 className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
                </div>
              </div>

              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
                  Başarılı
                </h1>
                {category ? (
                  <p className="text-gray-600 dark:text-gray-400">
                    <strong>{CATEGORY_LABELS[category] || category}</strong> kategorisinden çıkış yaptınız.
                  </p>
                ) : (
                  <p className="text-gray-600 dark:text-gray-400">
                    Tüm email kategorilerinden çıkış yaptınız.
                  </p>
                )}
              </div>

              {result.data?.message && (
                <p className="text-sm text-gray-500 dark:text-gray-400 italic">
                  {result.data.message}
                </p>
              )}
            </div>

            {/* Next steps */}
            <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg space-y-3">
              <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                İleri Adımlar
              </p>
              <div className="space-y-2 text-sm text-blue-800 dark:text-blue-200">
                {result.data?.canManagePreferences && (
                  <div className="flex items-start gap-2">
                    <span className="flex-shrink-0 mt-0.5">•</span>
                    <span>
                      <a
                        href="/EmailPreferences"
                        className="underline hover:no-underline font-medium"
                      >
                        Email tercihlerinizi buradan yönetebilirsiniz
                      </a>
                    </span>
                  </div>
                )}
                <div className="flex items-start gap-2">
                  <span className="flex-shrink-0 mt-0.5">•</span>
                  <span>
                    Geri çıkış yapmak istiyorsanız hesap ayarlarınızı güncelleyin
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="flex-shrink-0 mt-0.5">•</span>
                  <span>
                    Kritik mailler (hesap güvenliği, ödeme) yine de gönderilmeye devam eder
                  </span>
                </div>
              </div>
            </div>

            {/* Back to home */}
            <a
              href="/"
              className="block w-full text-center px-4 py-2 bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-600 dark:hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors"
            >
              Ana Sayfaya Dön
            </a>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Error card */}
            <div className="p-6 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg space-y-4 text-center">
              <div className="flex justify-center">
                <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                  <AlertCircle className="w-6 h-6 text-red-600 dark:text-red-400" />
                </div>
              </div>

              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
                  Çıkış Başarısız
                </h1>
                <p className="text-gray-600 dark:text-gray-400">
                  {result.error}
                </p>
              </div>
            </div>

            {/* Info */}
            <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg space-y-2">
              <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
                Neler deneyebilirsiniz?
              </p>
              <ul className="text-sm text-amber-800 dark:text-amber-200 space-y-1">
                <li>• Emailinizi tekrar kontrol edin ve linki açın</li>
                <li>• Linkinin süresi dolduysa yeni bir çıkış isteği gönderin</li>
                <li>• Destek ekibine başvurun</li>
              </ul>
            </div>

            {/* Back to home */}
            <a
              href="/"
              className="block w-full text-center px-4 py-2 bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-600 dark:hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors"
            >
              Ana Sayfaya Dön
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
