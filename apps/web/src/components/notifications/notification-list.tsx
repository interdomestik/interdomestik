import { Bell, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { NotificationItem, type Notification } from './notification-item';

interface NotificationListProps {
  readonly loading: boolean;
  readonly notifications: Notification[];
  readonly pendingAll: boolean;
  readonly pendingIds: ReadonlySet<string>;
  readonly onMarkAsRead: (id: string, event?: React.MouseEvent) => Promise<void>;
  readonly onClose: () => void;
}

export function NotificationList({
  loading,
  notifications,
  pendingAll,
  pendingIds,
  onMarkAsRead,
  onClose,
}: NotificationListProps) {
  const t = useTranslations('notifications');
  const tCommon = useTranslations('common');

  if (loading) {
    return (
      <div className="flex h-32 items-center justify-center" role="status">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="sr-only">{tCommon('loading')}</span>
      </div>
    );
  }
  if (notifications.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-48 text-center p-6 space-y-2 opacity-60">
        <Bell className="h-10 w-10 text-muted-foreground/30" />
        <p className="text-xs font-medium">{t('empty')}</p>
      </div>
    );
  }
  return (
    <div className="grid">
      {notifications.map(notification => (
        <NotificationItem
          key={notification.id}
          notification={notification}
          pending={pendingAll || pendingIds.has(notification.id)}
          onMarkAsRead={onMarkAsRead}
          onClose={onClose}
          markReadLabel={t('markRead', { title: notification.title })}
          viewLabel={tCommon('view')}
        />
      ))}
    </div>
  );
}
