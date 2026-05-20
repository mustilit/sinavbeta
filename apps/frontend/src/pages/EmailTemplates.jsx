import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api/apiClient';
import { toast } from 'sonner';
import {
  Mail,
  Edit2,
  Loader2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import * as Dialog from '@radix-ui/react-dialog';

const EMAIL_QUEUES = {
  CRITICAL: 'Kritik',
  NOTIFY: 'Bildirim',
  BULK: 'Toplu',
};

function TemplateEditForm({ template, onSubmit, isPending }) {
  const [form, setForm] = useState({
    subject: template?.subject || '',
    description: template?.description || '',
    defaultQueue: template?.defaultQueue || 'NOTIFY',
    isActive: template?.isActive !== false,
  });

  const [errors, setErrors] = useState({});

  const validate = () => {
    const newErrors = {};
    if (!form.subject?.trim()) newErrors.subject = 'Konu gerekli';
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
        <label htmlFor="template-subject" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          Konu
        </label>
        <input
          id="template-subject"
          type="text"
          value={form.subject}
          onChange={(e) => setForm({ ...form, subject: e.target.value })}
          placeholder="Örn. Hesap Doğrulama"
          aria-invalid={Boolean(errors.subject)}
          className="mt-1 w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        {errors.subject && <p className="text-xs text-red-600 dark:text-red-400 mt-1">{errors.subject}</p>}
      </div>

      <div>
        <label htmlFor="template-description" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          Açıklama
        </label>
        <textarea
          id="template-description"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          placeholder="Bu şablon neden kullanılır?"
          rows={3}
          className="mt-1 w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      <div>
        <label htmlFor="template-queue" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          Varsayılan Kuyruk
        </label>
        <select
          id="template-queue"
          value={form.defaultQueue}
          onChange={(e) => setForm({ ...form, defaultQueue: e.target.value })}
          className="mt-1 w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          {Object.entries(EMAIL_QUEUES).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>

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

function TemplateRow({ template, onEdit }) {
  const [open, setOpen] = useState(false);

  return (
    <div key={template.id} className="space-y-0">
      <button
        onClick={() => setOpen(!open)}
        className="w-full p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:border-indigo-300 dark:hover:border-indigo-700 transition-colors flex items-center justify-between"
      >
        <div className="flex-1 text-left min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-mono font-semibold text-gray-900 dark:text-gray-100">{template.key}</p>
            {template.isActive ? (
              <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300">
                Aktif
              </span>
            ) : (
              <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                Pasif
              </span>
            )}
          </div>
          {template.subject && (
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 truncate">{template.subject}</p>
          )}
        </div>

        <div className="flex items-center gap-2 flex-shrink-0 ml-4">
          <span className="text-xs px-2 py-1 rounded bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
            {EMAIL_QUEUES[template.defaultQueue] || template.defaultQueue}
          </span>
          {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </button>

      {open && (
        <div className="p-4 bg-gray-50 dark:bg-gray-900 border border-t-0 border-gray-200 dark:border-gray-700 rounded-b-lg space-y-4">
          {template.description && (
            <div>
              <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Açıklama</p>
              <p className="text-sm text-gray-700 dark:text-gray-300">{template.description}</p>
            </div>
          )}

          {template.version && (
            <div>
              <p className="text-xs font-medium text-gray-600 dark:text-gray-400">Versiyon</p>
              <p className="text-sm text-gray-700 dark:text-gray-300">{template.version}</p>
            </div>
          )}

          <button
            onClick={() => onEdit(template)}
            className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-600 dark:hover:bg-indigo-700 text-white text-sm font-medium rounded flex items-center gap-2 w-fit"
          >
            <Edit2 className="w-4 h-4" />
            Düzenle
          </button>
        </div>
      )}
    </div>
  );
}

export default function EmailTemplates() {
  const queryClient = useQueryClient();
  const [editingTemplate, setEditingTemplate] = useState(null);

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ['email', 'templates'],
    queryFn: async () => {
      const { data } = await api.get('/admin/email/templates');
      return data || [];
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (body) => {
      const { data } = await api.patch(`/admin/email/templates/${editingTemplate.id}`, body);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email', 'templates'] });
      toast.success('Şablon güncellendi');
      setEditingTemplate(null);
    },
    onError: (error) => {
      toast.error(error.response?.data?.message || 'Güncellenemedi');
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400 dark:text-gray-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-purple-50 dark:bg-purple-900/30 flex items-center justify-center">
          <Mail className="w-5 h-5 text-purple-600 dark:text-purple-400" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Email Şablonları</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Sistem şablonlarının meta bilgilerini yönetin</p>
        </div>
      </div>

      {/* Templates list */}
      {templates.length === 0 ? (
        <div className="text-center py-12">
          <Mail className="w-12 h-12 text-gray-300 dark:text-gray-700 mx-auto mb-3" />
          <p className="text-gray-600 dark:text-gray-400">Şablon bulunamadı</p>
        </div>
      ) : (
        <div className="space-y-2">
          {templates.map((template) => (
            <TemplateRow key={template.id} template={template} onEdit={setEditingTemplate} />
          ))}
        </div>
      )}

      {/* Edit dialog */}
      {editingTemplate && (
        <Dialog.Root open={Boolean(editingTemplate)} onOpenChange={(o) => !o && setEditingTemplate(null)}>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 bg-black/50 z-40" />
            <Dialog.Content
              className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[95vw] max-w-md max-h-[90vh] overflow-y-auto bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6 shadow-xl focus:outline-none"
              aria-describedby={undefined}
            >
              <Dialog.Title className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
                Şablonu Düzenle — <span className="font-mono">{editingTemplate.key}</span>
              </Dialog.Title>
              <TemplateEditForm
                template={editingTemplate}
                onSubmit={(f) => updateMutation.mutate(f)}
                isPending={updateMutation.isPending}
              />
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      )}
    </div>
  );
}
