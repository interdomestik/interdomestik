'use client';

import { getNotifications, markAllAsRead, markAsRead } from '@/actions/notifications';
import { supabase } from '@/lib/supabase';
import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  cn,
} from '@interdomestik/ui';
import { formatDistanceToNow } from 'date-fns';
import {
  AlertCircle,
  Bell,
  Check,
  CheckCheck,
  ClipboardCheck,
  ExternalLink,
  Loader2,
  MessageSquare,
  UserPlus,
} from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

interface Notification {
  id: string;
  userId: string;
  type: string;
  title: string;
  content: string;
  actionUrl: string | null;
  isRead: boolean;
  createdAt: Date | string;
}

interface NotificationCenterProps {
  subscriberId: string;
}

export function NotificationCenter({ subscriberId }: NotificationCenterProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);

  const fetchInitialNotifications = useCallback(async () => {
    try {
      const data = await getNotifications();
      setNotifications(data as unknown as Notification[]);
      const unread = data.filter(n => !n.isRead).length;
      setUnreadCount(unread);
    } catch (error) {
      console.error('Failed to fetch notifications:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInitialNotifications();

    const channel = supabase
      .channel(`user-notifications-${subscriberId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${subscriberId}`,
        },
        payload => {
          const newNotification = payload.new as Notification;
          setNotifications(prev => [newNotification, ...prev]);
          setUnreadCount(prev => prev + 1);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [subscriberId, fetchInitialNotifications]);

  const handleMarkAsRead = async (id: string, e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    try {
      await markAsRead(id);
      setNotifications(prev => prev.map(n => (n.id === id ? { ...n, isRead: true } : n)));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (error) {
      console.error('Failed to mark as read:', error);
    }
  };

  const handleMarkAllAsRead = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await markAllAsRead();
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch (error) {
      console.error('Failed to mark all as read:', error);
    }
  };

  const getIcon = (type: string) => {
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
  };

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-9 w-9 rounded-full transition-colors hover:bg-accent/50"
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
      <DropdownMenuContent
        className="w-80 bg-background/95 backdrop-blur-xl border shadow-2xl z-50 rounded-xl max-h-[500px] flex flex-col"
        align="end"
      >
        <div className="flex items-center justify-between p-4 border-b">
          <h4 className="text-sm font-semibold">Notifications</h4>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 py-0 px-2 text-xs text-muted-foreground hover:text-primary transition-colors"
              onClick={handleMarkAllAsRead}
            >
              Mark all read
            </Button>
          )}
        </div>

        <div className="overflow-y-auto overflow-x-hidden flex-1">
          {loading ? (
            <div className="flex h-32 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-center p-6 space-y-2 opacity-60">
              <Bell className="h-10 w-10 text-muted-foreground/30" />
              <p className="text-xs font-medium">All caught up!</p>
              <p className="text-[10px] text-muted-foreground">No new notifications.</p>
            </div>
          ) : (
            <div className="grid">
              {notifications.map(notification => (
                <div
                  key={notification.id}
                  className={cn(
                    'relative flex gap-3 p-4 transition-all duration-200 hover:bg-accent/30 list-none border-b last:border-0',
                    !notification.isRead && 'bg-primary/5 border-l-2 border-primary'
                  )}
                >
                  <div className="shrink-0 mt-1">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-background border shadow-sm">
                      {getIcon(notification.type)}
                    </div>
                  </div>
                  <div className="flex flex-col flex-1 gap-1">
                    <div className="flex items-start justify-between gap-2">
                      <p
                        className={cn(
                          'text-xs font-semibold leading-tight',
                          !notification.isRead ? 'text-foreground' : 'text-muted-foreground'
                        )}
                      >
                        {notification.title}
                      </p>
                      {!notification.isRead && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5 rounded-full hover:bg-primary/20 hover:text-primary"
                          onClick={e => handleMarkAsRead(notification.id, e)}
                        >
                          <Check className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground line-clamp-2">
                      {notification.content}
                    </p>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-[10px] text-muted-foreground/60 font-medium">
                        {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
                      </span>
                      {notification.actionUrl && (
                        <Link
                          href={notification.actionUrl}
                          onClick={() => {
                            if (!notification.isRead) handleMarkAsRead(notification.id);
                            setIsOpen(false);
                          }}
                          className="inline-flex items-center gap-1 text-[10px] font-bold text-primary hover:underline"
                        >
                          View <ExternalLink className="h-2 w-2" />
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
