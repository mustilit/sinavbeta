import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api/apiClient';
import { toast } from 'sonner';
import {
  Plus,
  Pencil,
  Trash2,
  Mail,
  Eye,
  EyeOff,
  Loader2,
  Send,
  Info,
} from 'lucide-react';
import * as Dialog from '@radix-ui/react-dialog';

const PROVIDER_KINDS = {
  BREVO_API: 'Brevo API',
  SMTP: 'SMTP',
  CONSOLE: 'Console',
};

function ProviderForm({ provider = null, onSubmit, isPending }) {
  const [form, setForm] = useState(
    provider || {
      name: '',
      kind: 'BREVO_API',
      priority: 1,
      isActive: true,
      fromEmail: '',
      fromName: '',
      replyToEmail: '',
      dailyCap: 10000,
      generateWebhookSecret: false,
      apiKey: '',
      smtpHost: '',
      smtpPort: 443,
      smtpSecure: true,
      smtpUser: '',
      smtpPass: '',
    }
  );

  const [showPassword, setShowPassword] = useState({
    apiKey: false,
    smtpPass: false,
  });

  const [errors, setErrors] = useState(/** @type {any} */ ({}));

  const validate = () => {
    const newErrors = {};
    if (!form.name?.trim()) newErrors.name = 'İsim gerekli';
    if (!form.fromEmail?.trim()) newErrors.fromEmail = 'Email adresi gerekli';
    if (form.kind === 'BREVO_API' && !form.apiKey?.trim()) newErrors.apiKey = 'API key gerekli';
    if (form.kind === 'SMTP') {
      if (!form.smtpHost?.trim()) newErrors.smtpHost = 'SMTP host gerekli';
      if (!form.smtpPort) newErrors.smtpPort = 'SMTP port gerekli';
      if (!form.smtpUser?.trim()) newErrors.smtpUser = 'SMTP kullanıcı adı gerekli';
      if (!form.smtpPass?.trim()) newErrors.smtpPass = 'SMTP şifresi gerekli';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = () => {
    if (validate()) {
      onSubmit(form);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="provider-name" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          Sağlayıcı Adı
        </label>
        <input
          id="provider-name"
          type="text"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="Örn. Brevo (Ana)"
          aria-invalid={Boolean(errors.name)}
          className="mt-1 w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        {errors.name && <p className="text-xs text-red-600 dark:text-red-400 mt-1">{errors.name}</p>}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="provider-kind" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Tür
          </label>
          <select
            id="provider-kind"
            value={form.kind}
            onChange={(e) => setForm({ ...form, kind: e.target.value })}
            className="mt-1 w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="BREVO_API">Brevo API</option>
            <option value="SMTP">SMTP</option>
            <option value="CONSOLE">Console</option>
          </select>
        </div>

        <div>
          <label htmlFor="provider-priority" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Öncelik
          </label>
          <input
            id="provider-priority"
            type="number"
            min="1"
            value={form.priority}
            onChange={(e) => setForm({ ...form, priority: parseInt(e.target.value) || 1 })}
            className="mt-1 w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
              className="w-4 h-4 rounded border-gray-300 dark:border-gray-600"
            />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Aktif</span>
          </label>
        </div>
        {form.kind === 'BREVO_API' && (
          <div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.generateWebhookSecret}
                onChange={(e) => setForm({ ...form, generateWebhookSecret: e.target.checked })}
                className="w-4 h-4 rounded border-gray-300 dark:border-gray-600"
              />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Webhook Secret</span>
            </label>
          </div>
        )}
      </div>

      <div>
        <label htmlFor="provider-from-email" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          Gönderen Email Adresi
        </label>
        <input
          id="provider-from-email"
          type="email"
          value={form.fromEmail}
          onChange={(e) => setForm({ ...form, fromEmail: e.target.value })}
          placeholder="noreply@exam.com"
          aria-invalid={Boolean(errors.fromEmail)}
          className="mt-1 w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        {errors.fromEmail && <p className="text-xs text-red-600 dark:text-red-400 mt-1">{errors.fromEmail}</p>}
      </div>

      <div>
        <label htmlFor="provider-from-name" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          Gönderen Adı
        </label>
        <input
          id="provider-from-name"
          type="text"
          value={form.fromName}
          onChange={(e) => setForm({ ...form, fromName: e.target.value })}
          placeholder="Sınav Salonu"
          className="mt-1 w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      <div>
        <label htmlFor="provider-reply-email" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          Reply-To Email (isteğe bağlı)
        </label>
        <input
          id="provider-reply-email"
          type="email"
          value={form.replyToEmail}
          onChange={(e) => setForm({ ...form, replyToEmail: e.target.value })}
          placeholder="support@exam.com"
          className="mt-1 w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      <div>
        <label htmlFor="provider-daily-cap" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          Günlük Limit
        </label>
        <input
          id="provider-daily-cap"
          type="number"
          min="100"
          value={form.dailyCap}
          onChange={(e) => setForm({ ...form, dailyCap: parseInt(e.target.value) || 10000 })}
          className="mt-1 w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      {form.kind === 'BREVO_API' && (
        <div>
          <label htmlFor="provider-api-key" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            API Key
          </label>
          <div className="mt-1 relative">
            <input
              id="provider-api-key"
              type={showPassword.apiKey ? 'text' : 'password'}
              value={form.apiKey}
              onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
              placeholder="••••••••"
              aria-invalid={Boolean(errors.apiKey)}
              className="w-full px-3 py-2 pr-10 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <button
              type="button"
              onClick={() => setShowPassword((p) => ({ ...p, apiKey: !p.apiKey }))}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
              aria-label={showPassword.apiKey ? 'Gizle' : 'Göster'}
            >
              {showPassword.apiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {errors.apiKey && <p className="text-xs text-red-600 dark:text-red-400 mt-1">{errors.apiKey}</p>}
        </div>
      )}

      {form.kind === 'SMTP' && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="smtp-host" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Host
              </label>
              <input
                id="smtp-host"
                type="text"
                value={form.smtpHost}
                onChange={(e) => setForm({ ...form, smtpHost: e.target.value })}
                placeholder="smtp.gmail.com"
                aria-invalid={Boolean(errors.smtpHost)}
                className="mt-1 w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              {errors.smtpHost && <p className="text-xs text-red-600 dark:text-red-400 mt-1">{errors.smtpHost}</p>}
            </div>
            <div>
              <label htmlFor="smtp-port" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Port
              </label>
              <input
                id="smtp-port"
                type="number"
                value={form.smtpPort}
                onChange={(e) => setForm({ ...form, smtpPort: parseInt(e.target.value) || 465 })}
                className="mt-1 w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              {errors.smtpPort && <p className="text-xs text-red-600 dark:text-red-400 mt-1">{errors.smtpPort}</p>}
            </div>
          </div>

          <div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.smtpSecure}
                onChange={(e) => setForm({ ...form, smtpSecure: e.target.checked })}
                className="w-4 h-4 rounded border-gray-300 dark:border-gray-600"
              />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                SSL/TLS (465) {!form.smtpSecure && '— STARTTLS (587)'}
              </span>
            </label>
          </div>

          <div>
            <label htmlFor="smtp-user" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Kullanıcı Adı
            </label>
            <input
              id="smtp-user"
              type="text"
              value={form.smtpUser}
              onChange={(e) => setForm({ ...form, smtpUser: e.target.value })}
              placeholder="user@gmail.com"
              aria-invalid={Boolean(errors.smtpUser)}
              className="mt-1 w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            {errors.smtpUser && <p className="text-xs text-red-600 dark:text-red-400 mt-1">{errors.smtpUser}</p>}
          </div>

          <div>
            <label htmlFor="smtp-pass" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Şifre
            </label>
            <div className="mt-1 relative">
              <input
                id="smtp-pass"
                type={showPassword.smtpPass ? 'text' : 'password'}
                value={form.smtpPass}
                onChange={(e) => setForm({ ...form, smtpPass: e.target.value })}
                placeholder="••••••••"
                aria-invalid={Boolean(errors.smtpPass)}
                className="w-full px-3 py-2 pr-10 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button
                type="button"
                onClick={() => setShowPassword((p) => ({ ...p, smtpPass: !p.smtpPass }))}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                aria-label={showPassword.smtpPass ? 'Gizle' : 'Göster'}
              >
                {showPassword.smtpPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {errors.smtpPass && <p className="text-xs text-red-600 dark:text-red-400 mt-1">{errors.smtpPass}</p>}
          </div>
        </>
      )}

      <div className="flex gap-2 justify-end pt-4 border-t border-gray-200 dark:border-gray-700">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={isPending}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-600 dark:hover:bg-indigo-700 text-white rounded-lg disabled:opacity-50 flex items-center gap-2"
        >
          {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
          Kaydet
        </button>
      </div>
    </div>
  );
}

function TestProviderDialog({ provider, isOpen, onOpenChange }) {
  const [toEmail, setToEmail] = useState('');
  const [subject, setSubject] = useState('Test Email');
  const [testResult, setTestResult] = useState(null);

  const testMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post(`/admin/email/providers/${provider.id}/test`, {
        toEmail,
        subject,
      });
      return data;
    },
    onSuccess: (data) => {
      setTestResult(data);
      toast.success('Test maili gönderildi');
    },
    onError: (error) => {
      setTestResult({ error: error.response?.data?.message || 'Test maili gönderilemedi' });
      toast.error('Hata oluştu');
    },
  });

  return (
    <Dialog.Root open={isOpen} onOpenChange={onOpenChange}>
      <Dialog.Content className="max-w-md bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6 space-y-4">
        <Dialog.Title className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Test Maili Gönder
        </Dialog.Title>

        <div className="space-y-4">
          <div>
            <label htmlFor="test-to-email" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Alıcı Email
            </label>
            <input
              id="test-to-email"
              type="email"
              value={toEmail}
              onChange={(e) => setToEmail(e.target.value)}
              placeholder="test@example.com"
              className="mt-1 w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label htmlFor="test-subject" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Konu
            </label>
            <input
              id="test-subject"
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="mt-1 w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {testResult && (
            <div
              className={`p-3 rounded-lg ${
                testResult.error
                  ? 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300'
                  : 'bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300'
              }`}
            >
              <p className="text-xs font-mono break-all">
                {testResult.error || `Başarılı: ${testResult.messageId}`}
              </p>
            </div>
          )}

          <button
            onClick={() => testMutation.mutate()}
            disabled={!toEmail.trim() || testMutation.isPending}
            className="w-full px-4 py-2 bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-600 dark:hover:bg-indigo-700 text-white rounded-lg disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {testMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            Gönder
          </button>
        </div>
      </Dialog.Content>
    </Dialog.Root>
  );
}

export default function EmailProviders() {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [testingProviderId, setTestingProviderId] = useState(null);
  const [testDialogOpen, setTestDialogOpen] = useState(false);

  const { data: providers = [], isLoading } = useQuery({
    queryKey: ['email', 'providers'],
    queryFn: async () => {
      const { data } = await api.get('/admin/email/providers');
      return data || [];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (/** @type {any} */ body) => {
      const { data } = await api.post('/admin/email/providers', body);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email', 'providers'] });
      toast.success('Sağlayıcı oluşturuldu');
      setIsCreateOpen(false);
    },
    onError: (error) => {
      toast.error(error.response?.data?.message || 'Oluşturulamadı');
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (/** @type {any} */ body) => {
      const { data } = await api.patch(`/admin/email/providers/${editingId}`, body);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email', 'providers'] });
      toast.success('Sağlayıcı güncellendi');
      setEditingId(null);
    },
    onError: (error) => {
      toast.error(error.response?.data?.message || 'Güncellenemedi');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (/** @type {any} */ id) => {
      await api.delete(`/admin/email/providers/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email', 'providers'] });
      toast.success('Sağlayıcı silindi');
    },
    onError: (error) => {
      toast.error(error.response?.data?.message || 'Silinemedi');
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400 dark:text-gray-600" />
      </div>
    );
  }

  const editingProvider = providers.find((p) => p.id === editingId);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-orange-50 dark:bg-orange-900/30 flex items-center justify-center">
            <Mail className="w-5 h-5 text-orange-600 dark:text-orange-400" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Email Sağlayıcıları</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">SMTP ve API tabanlı sağlayıcıları yönetin</p>
          </div>
        </div>

        <Dialog.Root open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <Dialog.Trigger asChild>
            <button className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-600 dark:hover:bg-indigo-700 text-white rounded-lg flex items-center gap-2">
              <Plus className="w-4 h-4" />
              Yeni Sağlayıcı
            </button>
          </Dialog.Trigger>
          <Dialog.Content className="max-w-md bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
            <Dialog.Title className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
              Yeni Sağlayıcı Ekle
            </Dialog.Title>
            <ProviderForm onSubmit={(f) => createMutation.mutate(f)} isPending={createMutation.isPending} />
          </Dialog.Content>
        </Dialog.Root>
      </div>

      {/* Info */}
      <div className="flex items-start gap-3 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
        <Info className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-blue-700 dark:text-blue-300 space-y-1">
          <p>
            <strong>Güvenlik:</strong> API anahtarları ve SMTP şifreleri AES-256-GCM ile şifrelenir.
            Gmail kullanıyorsanız uygulama şifresi kullanın.
          </p>
          <p>
            <strong>Webhook:</strong> Brevo API sağlayıcısı için webhook URL:
            <code className="bg-blue-900/30 px-1 py-0.5 rounded text-xs ml-1">
              api.com/webhooks/email/brevo?secret=...
            </code>
          </p>
        </div>
      </div>

      {/* Providers table */}
      {providers.length === 0 ? (
        <div className="text-center py-12">
          <Mail className="w-12 h-12 text-gray-300 dark:text-gray-700 mx-auto mb-3" />
          <p className="text-gray-600 dark:text-gray-400 mb-4">Henüz sağlayıcı eklenmemiş</p>
        </div>
      ) : (
        <div className="space-y-2">
          {providers.map((provider) => (
            <div
              key={provider.id}
              className="p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg flex items-center justify-between"
            >
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-gray-900 dark:text-gray-100">{provider.name}</p>
                  <span className="text-xs px-2 py-1 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                    {PROVIDER_KINDS[provider.kind] || provider.kind}
                  </span>
                  {provider.isActive && (
                    <span className="text-xs px-2 py-1 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300">
                      Aktif
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {provider.fromEmail} • Günlük Limit: {provider.dailyCap != null ? provider.dailyCap.toLocaleString('tr-TR') : '—'}
                </p>
                {provider.lastSuccessAt && (
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                    Son başarı: {new Date(provider.lastSuccessAt).toLocaleString('tr-TR')}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setTestingProviderId(provider.id);
                    setTestDialogOpen(true);
                  }}
                  className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                  aria-label="Test"
                >
                  <Send className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                </button>

                <button
                  onClick={() => setEditingId(provider.id)}
                  className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                  aria-label="Düzenle"
                >
                  <Pencil className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                </button>

                <button
                  onClick={() => deleteMutation.mutate(provider.id)}
                  disabled={deleteMutation.isPending}
                  className="p-2 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors disabled:opacity-50"
                  aria-label="Sil"
                >
                  <Trash2 className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Edit dialog */}
      {editingProvider && (
        <Dialog.Root open={Boolean(editingId)} onOpenChange={() => setEditingId(null)}>
          <Dialog.Content className="max-w-md bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
            <Dialog.Title className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
              Sağlayıcıyı Düzenle
            </Dialog.Title>
            <ProviderForm
              provider={editingProvider}
              onSubmit={(f) => updateMutation.mutate(f)}
              isPending={updateMutation.isPending}
            />
          </Dialog.Content>
        </Dialog.Root>
      )}

      {/* Test email dialog */}
      {testingProviderId && (
        <TestProviderDialog
          provider={providers.find((p) => p.id === testingProviderId)}
          isOpen={testDialogOpen}
          onOpenChange={setTestDialogOpen}
        />
      )}
    </div>
  );
}
