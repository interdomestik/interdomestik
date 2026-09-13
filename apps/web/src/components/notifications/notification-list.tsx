import { Badge, Button, DropdownMenuItem, DropdownMenuTrigger } from '@interdomestik/ui';
import { Bell, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { NotificationItem, type Notification } from './notification-item';

export function NotificationTrigger({ unreadCount }: { readonly unreadCount: number }) {
  const t = useTranslations('notifications');
  return (
    <DropdownMenuTrigger asChild>
      <Button
        variant="ghost"
        size="icon"
        className="relative h-9 w-9 rounded-full transition-colors hover:bg-accent/50"
        data-testid="notification-center-trigger"
        aria-label={t('title')}
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <Badge
            variant="destructive"
            className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full p-0 text-[10px]"
          >
            {unreadCount}
          </Badge>
        )}
      </Button>
    </DropdownMenuTrigger>
  );
}

interface NotificationListProps {
  readonly loading: boolean;
  readonly fetchFailed: boolean;
  readonly onRetry: () => Promise<void>;
  readonly notifications: Notification[];
  readonly pendingAll: boolean;
  readonly pendingIds: ReadonlySet<string>;
  readonly onMarkAsRead: (id: string, event?: React.MouseEvent) => Promise<boolean>;
  readonly onClose: () => void;
}

interface NotificationHeaderProps {
  readonly unreadCount: number;
  readonly pendingAll: boolean;
  readonly pendingIds: ReadonlySet<string>;
  readonly onMarkAllAsRead: (event: React.MouseEvent) => Promise<void>;
}

export function NotificationHeader({
  unreadCount,
  pendingAll,
  pendingIds,
  onMarkAllAsRead,
}: NotificationHeaderProps) {
  const t = useTranslations('notifications');
  const acknowledgementPending = pendingAll || pendingIds.size > 0;

  return (
    <div className="flex items-center justify-between p-4 border-b">
      <h4 className="text-sm font-semibold">{t('title')}</h4>
      {unreadCount > 0 && (
        <DropdownMenuItem
          asChild
          disabled={acknowledgementPending}
          onSelect={event => event.preventDefault()}
        >
          <Button
            variant="ghost"
            size="sm"
            className="h-8 py-0 px-2 text-xs text-muted-foreground hover:text-primary transition-colors"
            onClick={onMarkAllAsRead}
            disabled={acknowledgementPending}
            aria-busy={pendingAll}
            data-testid="notification-mark-all"
          >
            {t('markAllRead')}
          </Button>
        </DropdownMenuItem>
      )}
    </div>
  );
}

export function NotificationList({
  loading,
  fetchFailed,
  onRetry,
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
      <output className="flex h-32 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="sr-only">{tCommon('loading')}</span>
      </output>
    );
  }
  if (fetchFailed) {
    return (
      <div className="p-4 space-y-3">
        <p role="alert" className="text-sm text-destructive">
          {tCommon('errors.generic')}
        </p>
        <DropdownMenuItem asChild onSelect={event => event.preventDefault()}>
          <Button variant="outline" size="sm" onClick={() => void onRetry()}>
            {tCommon('tryAgain')}
          </Button>
        </DropdownMenuItem>
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

interface NotificationFeedbackProps {
  readonly statusMessage: string;
  readonly errorMessage: string | null;
}

export function NotificationFeedback({ statusMessage, errorMessage }: NotificationFeedbackProps) {
  return (
    <>
      <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {statusMessage}
      </p>
      {errorMessage ? (
        <p role="alert" className="border-b px-4 py-2 text-xs text-destructive">
          {errorMessage}
        </p>
      ) : null}
    </>
  );
}
