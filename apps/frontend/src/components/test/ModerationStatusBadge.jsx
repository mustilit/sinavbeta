import { Clock, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';
import { MODERATION_STATUS_LABELS_TR } from '@/lib/moderationLabels';
import { cn } from '@/lib/utils';

/**
 * İçerik moderasyon durumu badge'i
 * @param {string} status - PENDING_REVIEW | APPROVED | REJECTED | ESCALATED
 * @param {string} [className] - Opsiyonel ek Tailwind class'ları
 */
export function ModerationStatusBadge({ status, className }) {
  // Status değerine göre renk ve ikon
  const statusConfig = {
    PENDING_REVIEW: {
      icon: Clock,
      bgColor: 'bg-amber-100 dark:bg-amber-900/30',
      textColor: 'text-amber-700 dark:text-amber-300',
      label: MODERATION_STATUS_LABELS_TR.PENDING_REVIEW || 'İnceleme Bekliyor',
    },
    APPROVED: {
      icon: CheckCircle2,
      bgColor: 'bg-emerald-100 dark:bg-emerald-900/30',
      textColor: 'text-emerald-700 dark:text-emerald-300',
      label: MODERATION_STATUS_LABELS_TR.APPROVED || 'Onaylandı',
    },
    REJECTED: {
      icon: XCircle,
      bgColor: 'bg-rose-100 dark:bg-rose-900/30',
      textColor: 'text-rose-700 dark:text-rose-300',
      label: MODERATION_STATUS_LABELS_TR.REJECTED || 'Reddedildi',
    },
    ESCALATED: {
      icon: AlertTriangle,
      bgColor: 'bg-violet-100 dark:bg-violet-900/30',
      textColor: 'text-violet-700 dark:text-violet-300',
      label: MODERATION_STATUS_LABELS_TR.ESCALATED || 'Yönetime İletildi',
    },
  };

  const config = statusConfig[status] || statusConfig.PENDING_REVIEW;
  const Icon = config.icon;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium',
        config.bgColor,
        config.textColor,
        className,
      )}
      aria-label={`Moderasyon durumu: ${config.label}`}
    >
      <Icon className="w-3.5 h-3.5" aria-hidden="true" />
      {config.label}
    </span>
  );
}
