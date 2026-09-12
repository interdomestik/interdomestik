import { Button, cn, DropdownMenuItem } from '@interdomestik/ui';
import { formatDistanceToNow } from 'date-fns';
import {
  AlertCircle,
  Bell,
  Check,
  CheckCheck,
  ClipboardCheck,
  ExternalLink,
  MessageSquare,
  UserPlus,
} from 'lucide-react';
import Link from 'next/link';

export interface Notification {
  readonly id: string;
  readonly userId: string;
  readonly type: string;
  readonly title: string;
  readonly content: string;
  readonly actionUrl: string | null;
  readonly isRead: boolean;
  readonly createdAt: Date | string;
}

interface NotificationItemProps {
  readonly notification: Notification;
  readonly pending: boolean;
  readonly onMarkAsRead: (id: string, event?: React.MouseEvent) => Promise<void>;
  readonly onClose: () => void;
  readonly markReadLabel: string;
  readonly viewLabel: string;
}

function notificationIcon(type: string) {
  switch (type) {
    case 'claim_submitted':
      return <ClipboardCheck className="h-4 w-4 text-primary" />;
    case 'claim_assigned':
      return <UserPlus className="h-4 w-4 text-blue-500" />;
    case 'new_message':
      return <MessageSquare className="h-4 w-4 text-green-500" />;
    case 'claim_status_changed':
      return <CheckCheck className="h-4 w-4 text-purple-500" />;
    case 'sla_warning':
      return <AlertCircle className="h-4 w-4 text-amber-500" />;
    default:
      return <Bell className="h-4 w-4 text-muted-foreground" />;
  }
}

export function NotificationItem({
  notification,
  pending,
  onMarkAsRead,
  onClose,
  markReadLabel,
  viewLabel,
}: NotificationItemProps) {
  const isRead = notification.isRead;

  return (
    <div
      data-testid={`notification-item-${notification.type}`}
      aria-busy={pending}
      className={cn(
        'relative flex gap-3 p-4 transition-all duration-200 hover:bg-accent/30 list-none border-b last:border-0',
        !isRead && 'bg-primary/5 border-l-2 border-primary'
      )}
    >
      <div className="shrink-0 mt-1">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-background border shadow-sm">
          {notificationIcon(notification.type)}
        </div>
      </div>
      <div className="flex flex-col flex-1 gap-1">
        <div className="flex items-start justify-between gap-2">
          <p
            className={cn(
              'text-xs font-semibold leading-tight',
              !isRead ? 'text-foreground' : 'text-muted-foreground'
            )}
          >
            {notification.title}
          </p>
          {!isRead && (
            <DropdownMenuItem asChild disabled={pending} onSelect={event => event.preventDefault()}>
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5 rounded-full hover:bg-primary/20 hover:text-primary"
                onClick={event => onMarkAsRead(notification.id, event)}
                disabled={pending}
                aria-busy={pending}
                aria-label={markReadLabel}
              >
                <Check className="h-3 w-3" />
              </Button>
            </DropdownMenuItem>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground line-clamp-2">{notification.content}</p>
        <div className="flex items-center justify-between mt-1">
          <span className="text-[10px] text-muted-foreground/60 font-medium">
            {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
          </span>
          {notification.actionUrl && (
            <DropdownMenuItem asChild>
              <Link
                href={notification.actionUrl}
                onClick={() => {
                  if (!isRead) void onMarkAsRead(notification.id);
                  window.setTimeout(onClose, 0);
                }}
                className="inline-flex items-center gap-1 text-[10px] font-bold text-primary hover:underline"
                data-testid="notification-action"
              >
                {viewLabel} <ExternalLink className="h-2 w-2" />
              </Link>
            </DropdownMenuItem>
          )}
        </div>
      </div>
    </div>
  );
}
