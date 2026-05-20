import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api/apiClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { AlertTriangle, Save, RotateCcw } from 'lucide-react';

const DEFAULT_THRESHOLDS = {
  hate: 0.7,
  sexual: 0.6,
  violence: 0.7,
  selfHarm: 0.5,
  harassment: 0.7,
  illegal: 0.7,
  profanity: 0.6,
};

const THRESHOLD_LABELS = {
  hate: 'Nefret Söylemi',
  sexual: 'Müstehcen İçerik',
  violence: 'Şiddet',
  selfHarm: 'Öz Zarar',
  harassment: 'Taciz',
  illegal: 'Yasadışı İçerik',
  profanity: 'Küfür',
};

export default function ModerationSettings() {
  const queryClient = useQueryClient();

  // Form state
  const [moderationEnabled, setModerationEnabled] = useState(true);
  const [moderationClaudeEnabled, setModerationClaudeEnabled] = useState(true);
  const [moderationModelText, setModerationModelText] = useState('claude-haiku-4-5');
  const [moderationModelVision, setModerationModelVision] = useState('claude-sonnet-4-6');
  const [moderationAutoSuspendThreshold, setModerationAutoSuspendThreshold] = useState(80);
  const [moderationAutoBanThreshold, setModerationAutoBanThreshold] = useState(95);
  const [thresholds, setThresholds] = useState(DEFAULT_THRESHOLDS);

  // Original state for reset
  const [originalValues, setOriginalValues] = useState({});

  const { data: settings, isLoading, isError } = useQuery({
    queryKey: ['admin', 'settings'],
    queryFn: async () => {
      const { data } = await api.get('/admin/settings');
      return data;
    },
  });

  // Initialize form from fetched settings
  useEffect(() => {
    if (settings) {
      const newThresholds = settings.moderationThresholds || DEFAULT_THRESHOLDS;
      setModerationEnabled(settings.moderationEnabled ?? true);
      setModerationClaudeEnabled(settings.moderationClaudeEnabled ?? true);
      setModerationModelText(settings.moderationModelText || 'claude-haiku-4-5');
      setModerationModelVision(settings.moderationModelVision || 'claude-sonnet-4-6');
      setModerationAutoSuspendThreshold(settings.moderationAutoSuspendThreshold ?? 80);
      setModerationAutoBanThreshold(settings.moderationAutoBanThreshold ?? 95);
      setThresholds(newThresholds);
      setOriginalValues({
        moderationEnabled,
        moderationClaudeEnabled,
        moderationModelText,
        moderationModelVision,
        moderationAutoSuspendThreshold,
        moderationAutoBanThreshold,
        thresholds: newThresholds,
      });
    }
  }, [settings]);

  const updateMutation = useMutation({
    mutationFn: async (body) => {
      const { data } = await api.patch('/admin/settings', body);
      return data;
    },
    onSuccess: () => {
      toast.success('Ayarlar güncellendi');
      queryClient.invalidateQueries({ queryKey: ['admin', 'settings'] });
      // Update original values to enable proper reset
      setOriginalValues({
        moderationEnabled,
        moderationClaudeEnabled,
        moderationModelText,
        moderationModelVision,
        moderationAutoSuspendThreshold,
        moderationAutoBanThreshold,
        thresholds,
      });
    },
    onError: (err) => {
      toast.error(err?.response?.data?.message || 'Ayarlar kaydedilemedi');
    },
  });

  const handleSave = () => {
    const body = {
      moderationEnabled,
      moderationClaudeEnabled,
      moderationModelText,
      moderationModelVision,
      moderationAutoSuspendThreshold,
      moderationAutoBanThreshold,
      moderationThresholds: thresholds,
    };
    updateMutation.mutate(body);
  };

  const handleReset = () => {
    setModerationEnabled(originalValues.moderationEnabled ?? true);
    setModerationClaudeEnabled(originalValues.moderationClaudeEnabled ?? true);
    setModerationModelText(originalValues.moderationModelText || 'claude-haiku-4-5');
    setModerationModelVision(originalValues.moderationModelVision || 'claude-sonnet-4-6');
    setModerationAutoSuspendThreshold(originalValues.moderationAutoSuspendThreshold ?? 80);
    setModerationAutoBanThreshold(originalValues.moderationAutoBanThreshold ?? 95);
    setThresholds(originalValues.thresholds || DEFAULT_THRESHOLDS);
  };

  const isChanged =
    moderationEnabled !== originalValues.moderationEnabled ||
    moderationClaudeEnabled !== originalValues.moderationClaudeEnabled ||
    moderationModelText !== originalValues.moderationModelText ||
    moderationModelVision !== originalValues.moderationModelVision ||
    moderationAutoSuspendThreshold !== originalValues.moderationAutoSuspendThreshold ||
    moderationAutoBanThreshold !== originalValues.moderationAutoBanThreshold ||
    JSON.stringify(thresholds) !== JSON.stringify(originalValues.thresholds);

  if (isLoading) {
    return (
      <div className="p-6 space-y-6 max-w-4xl">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-96 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-6">
        <Card className="bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800">
          <CardContent className="pt-6">
            <p className="text-red-700 dark:text-red-300">Ayarlar yüklenemedi</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
          Moderasyon Ayarları
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mt-2">
          İçerik moderasyonu ve güvenlik ayarlarını yapılandırın
        </p>
      </div>

      {/* Main Settings */}
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardHeader>
          <CardTitle className="text-lg text-gray-900 dark:text-gray-100">
            Genel Ayarlar
          </CardTitle>
          <CardDescription>
            Moderasyon özelliklerini etkinleştirin veya devre dışı bırakın
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Moderation Enabled */}
          <div className="flex items-center justify-between p-4 rounded-lg bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700">
            <div className="flex-1">
              <Label htmlFor="moderation-enabled" className="text-sm font-medium text-gray-900 dark:text-gray-100 cursor-pointer">
                İçerik Moderasyonu Aktif
              </Label>
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                Tüm yüklenen içeriği otomatik olarak kontrol et
              </p>
            </div>
            <Switch
              id="moderation-enabled"
              checked={moderationEnabled}
              onCheckedChange={setModerationEnabled}
            />
          </div>

          {moderationEnabled && (
            <>
              {/* Claude Deep Moderation */}
              <div className="flex items-center justify-between p-4 rounded-lg bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700">
                <div className="flex-1">
                  <Label htmlFor="claude-enabled" className="text-sm font-medium text-gray-900 dark:text-gray-100 cursor-pointer">
                    Claude API ile Derin Moderasyon
                  </Label>
                  <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                    Daha detaylı içerik analizi için Claude AI kullan
                  </p>
                </div>
                <Switch
                  id="claude-enabled"
                  checked={moderationClaudeEnabled}
                  onCheckedChange={setModerationClaudeEnabled}
                />
              </div>

              {moderationClaudeEnabled && (
                <>
                  {/* Model Selection */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                    <div>
                      <Label htmlFor="model-text" className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        Metin Analiz Modeli
                      </Label>
                      <Select value={moderationModelText} onValueChange={setModerationModelText}>
                        <SelectTrigger id="model-text" className="mt-2">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="claude-haiku-4-5">
                            Claude Haiku 4.5 (hızlı, ucuz)
                          </SelectItem>
                          <SelectItem value="claude-sonnet-4-6">
                            Claude Sonnet 4.6 (dengeli)
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                        Metin içeriği analizi için kullanılacak model
                      </p>
                    </div>

                    <div>
                      <Label htmlFor="model-vision" className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        Görsel Analiz Modeli
                      </Label>
                      <Select value={moderationModelVision} onValueChange={setModerationModelVision}>
                        <SelectTrigger id="model-vision" className="mt-2">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="claude-haiku-4-5">
                            Claude Haiku 4.5 (hızlı, ucuz)
                          </SelectItem>
                          <SelectItem value="claude-sonnet-4-6">
                            Claude Sonnet 4.6 (dengeli)
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                        Görsel içeriği analizi için kullanılacak model
                      </p>
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Category Thresholds */}
      {moderationEnabled && (
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardHeader>
            <CardTitle className="text-lg text-gray-900 dark:text-gray-100">
              Kategori Eşikleri
            </CardTitle>
            <CardDescription>
              Her kategori için ihlal sayılması için minimum puan (0.0 — 1.0)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {Object.entries(THRESHOLD_LABELS).map(([key, label]) => (
              <div key={key}>
                <div className="flex items-center justify-between mb-2">
                  <Label htmlFor={`threshold-${key}`} className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {label}
                  </Label>
                  <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                    {(thresholds[key] * 100).toFixed(0)}%
                  </span>
                </div>
                <div className="flex items-center gap-4">
                  <input
                    id={`threshold-${key}`}
                    type="range"
                    min="0"
                    max="100"
                    step="5"
                    value={(thresholds[key] * 100).toFixed(0)}
                    onChange={(e) => {
                      const newVal = parseFloat(e.target.value) / 100;
                      setThresholds({ ...thresholds, [key]: newVal });
                    }}
                    className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer
                               [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4
                               [&::-webkit-slider-thumb]:bg-indigo-600 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer
                               [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4
                               [&::-moz-range-thumb]:bg-indigo-600 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:cursor-pointer
                               [&::-moz-range-thumb]:border-0"
                    aria-label={`${label} eşiği`}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setThresholds({ ...thresholds, [key]: DEFAULT_THRESHOLDS[key] });
                    }}
                    className="px-2 py-1 text-xs font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 transition-colors"
                  >
                    Varsayılana Döndür
                  </button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Auto-Action Thresholds */}
      {moderationEnabled && (
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardHeader>
            <CardTitle className="text-lg text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
              Otomatik Yaptırım Eşikleri
            </CardTitle>
            <CardDescription>
              Eğitici risk skoru bu eşikleri aştığında otomatik işlem başlat
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <Label htmlFor="suspend-threshold" className="text-sm font-medium text-gray-900 dark:text-gray-100">
                Otomatik Askıya Alma Eşiği (%)
              </Label>
              <Input
                id="suspend-threshold"
                type="number"
                min="0"
                max="100"
                value={moderationAutoSuspendThreshold}
                onChange={(e) => setModerationAutoSuspendThreshold(parseInt(e.target.value, 10))}
                className="mt-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 border-gray-200 dark:border-gray-600"
              />
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                Risk skoru bu yüzdeyi aşarsa hesap otomatik askıya alınır
              </p>
            </div>

            <div>
              <Label htmlFor="ban-threshold" className="text-sm font-medium text-gray-900 dark:text-gray-100">
                Otomatik Yasaklama Eşiği (%)
              </Label>
              <Input
                id="ban-threshold"
                type="number"
                min="0"
                max="100"
                value={moderationAutoBanThreshold}
                onChange={(e) => setModerationAutoBanThreshold(parseInt(e.target.value, 10))}
                className="mt-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 border-gray-200 dark:border-gray-600"
              />
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                Risk skoru bu yüzdeyi aşarsa hesap otomatik yasaklanır
              </p>
            </div>

            <div className="p-4 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
              <p className="text-xs font-semibold text-amber-700 dark:text-amber-300 uppercase">
                Varsayılan Değerler
              </p>
              <p className="text-sm text-amber-600 dark:text-amber-400 mt-1">
                Askıya Alma: 80% | Yasaklama: 95%
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Action Buttons */}
      <div className="flex items-center gap-3 pt-6 border-t border-gray-200 dark:border-gray-700">
        <Button
          onClick={handleSave}
          disabled={!isChanged || updateMutation.isPending}
          className="gap-2 bg-indigo-600 hover:bg-indigo-700"
        >
          <Save className="w-4 h-4" />
          {updateMutation.isPending ? 'Kaydediliyor...' : 'Kaydet'}
        </Button>
        <Button
          onClick={handleReset}
          disabled={!isChanged}
          variant="outline"
          className="gap-2"
        >
          <RotateCcw className="w-4 h-4" />
          Sıfırla
        </Button>
      </div>
    </div>
  );
}
