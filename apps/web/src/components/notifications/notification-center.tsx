'use client';

import { getNotifications, markAllAsRead, markAsRead } from '@/actions/notifications';
import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@interdomestik/ui';
import { Bell } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { Notification } from './notification-item';
import { NotificationFeedback, NotificationHeader, NotificationList } from './notification-list';
interface NotificationCenterProps {
  readonly subscriberId: string;
  readonly fetchOnMount?: boolean;
}

interface NotificationSnapshot {
  readonly subscriberId: string;
  readonly items: Notification[];
}

interface LoadingState {
  readonly subscriberId: string;
  readonly active: boolean;
}

export function NotificationCenter({ subscriberId, fetchOnMount = true }: NotificationCenterProps) {
  const t = useTranslations('notifications');
  const tCommon = useTranslations('common');
  const [snapshot, setSnapshot] = useState<NotificationSnapshot>({ subscriberId, items: [] });
  const [loadingState, setLoadingState] = useState<LoadingState>({
    subscriberId,
    active: fetchOnMount,
  });
  const [isOpen, setIsOpen] = useState(false);
  const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(new Set());
  const [pendingAll, setPendingAll] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState('');
  const activeSubscriberRef = useRef(subscriberId);
  const subscriberEpochRef = useRef(0);
  const latestFetchRef = useRef(0);
  const stateRevisionRef = useRef(0);
  const pendingIdsRef = useRef<ReadonlySet<string>>(new Set());
  const pendingAllRef = useRef(false);
  const previousOpenRef = useRef(false);
  const isOpenRef = useRef(isOpen);

  activeSubscriberRef.current = subscriberId;
  isOpenRef.current = isOpen;

  const notifications = snapshot.subscriberId === subscriberId ? snapshot.items : [];
  const unreadCount = useMemo(
    () => notifications.filter(notification => !notification.isRead).length,
    [notifications]
  );
  const loading =
    loadingState.subscriberId === subscriberId ? loadingState.active : fetchOnMount || isOpen;

  const fetchInitialNotifications = useCallback(async () => {
    const requestId = ++latestFetchRef.current;
    const requestSubscriberId = subscriberId;
    const requestSubscriberEpoch = subscriberEpochRef.current;
    const requestRevision = stateRevisionRef.current;
    setLoadingState({ subscriberId: requestSubscriberId, active: true });
    try {
      const data = (await getNotifications()) as unknown as Notification[];
      if (
        activeSubscriberRef.current === requestSubscriberId &&
        subscriberEpochRef.current === requestSubscriberEpoch &&
        latestFetchRef.current === requestId &&
        stateRevisionRef.current === requestRevision
      ) {
        setSnapshot({ subscriberId: requestSubscriberId, items: data });
      }
    } catch (error) {
      if (activeSubscriberRef.current === requestSubscriberId) {
        console.error('Failed to fetch notifications:', error);
      }
    } finally {
      if (
        activeSubscriberRef.current === requestSubscriberId &&
        subscriberEpochRef.current === requestSubscriberEpoch &&
        latestFetchRef.current === requestId
      ) {
        setLoadingState({ subscriberId: requestSubscriberId, active: false });
      }
    }
  }, [subscriberId]);

  useEffect(() => {
    subscriberEpochRef.current += 1;
    pendingIdsRef.current = new Set();
    pendingAllRef.current = false;
    setPendingIds(new Set());
    setPendingAll(false);
    setErrorMessage(null);
    setStatusMessage('');
    setSnapshot({ subscriberId, items: [] });
    stateRevisionRef.current += 1;

    if (fetchOnMount || isOpenRef.current) {
      void fetchInitialNotifications();
    } else {
      setLoadingState({ subscriberId, active: false });
    }
  }, [fetchInitialNotifications, fetchOnMount, subscriberId]);

  useEffect(() => {
    if (isOpen && !previousOpenRef.current) void fetchInitialNotifications();
    previousOpenRef.current = isOpen;
  }, [fetchInitialNotifications, isOpen]);

  const handleMarkAsRead = async (id: string, event?: React.MouseEvent) => {
    event?.preventDefault();
    event?.stopPropagation();
    if (pendingAllRef.current || pendingIdsRef.current.has(id)) return false;

    const mutationSubscriberId = subscriberId;
    const mutationSubscriberEpoch = subscriberEpochRef.current;
    const nextPendingIds = new Set(pendingIdsRef.current).add(id);
    pendingIdsRef.current = nextPendingIds;
    setPendingIds(nextPendingIds);
    setErrorMessage(null);
    setStatusMessage(tCommon('processing'));
    stateRevisionRef.current += 1;

    try {
      const result = await markAsRead(id);
      if (
        activeSubscriberRef.current !== mutationSubscriberId ||
        subscriberEpochRef.current !== mutationSubscriberEpoch
      ) {
        return false;
      }
      if (!result.success || result.notificationId !== id) {
        setStatusMessage('');
        setErrorMessage(tCommon('errors.generic'));
        return false;
      }
      stateRevisionRef.current += 1;
      setSnapshot(previous =>
        previous.subscriberId === mutationSubscriberId
          ? {
              ...previous,
              items: previous.items.map(notification =>
                notification.id === id ? { ...notification, isRead: true } : notification
              ),
            }
          : previous
      );
      setStatusMessage(t('markedRead'));
      return true;
    } catch (error) {
      if (
        activeSubscriberRef.current === mutationSubscriberId &&
        subscriberEpochRef.current === mutationSubscriberEpoch
      ) {
        console.error('Failed to mark as read:', error);
        setStatusMessage('');
        setErrorMessage(tCommon('errors.generic'));
      }
      return false;
    } finally {
      if (
        activeSubscriberRef.current === mutationSubscriberId &&
        subscriberEpochRef.current === mutationSubscriberEpoch
      ) {
        const remainingIds = new Set(pendingIdsRef.current);
        remainingIds.delete(id);
        pendingIdsRef.current = remainingIds;
        setPendingIds(remainingIds);
      }
    }
  };

  const handleMarkAllAsRead = async (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (pendingAllRef.current || pendingIdsRef.current.size > 0) return;

    const mutationSubscriberId = subscriberId;
    const mutationSubscriberEpoch = subscriberEpochRef.current;
    const requestedUnreadIds = notifications
      .filter(notification => !notification.isRead)
      .map(notification => notification.id);
    pendingAllRef.current = true;
    setPendingAll(true);
    setErrorMessage(null);
    setStatusMessage(tCommon('processing'));
    stateRevisionRef.current += 1;

    try {
      const result = await markAllAsRead();
      if (
        activeSubscriberRef.current !== mutationSubscriberId ||
        subscriberEpochRef.current !== mutationSubscriberEpoch
      ) {
        return;
      }
      if (!result.success) {
        setStatusMessage('');
        setErrorMessage(tCommon('errors.generic'));
        return;
      }
      stateRevisionRef.current += 1;
      const confirmedIds = new Set(result.notificationIds);
      setSnapshot(previous =>
        previous.subscriberId === mutationSubscriberId
          ? {
              ...previous,
              items: previous.items.map(notification =>
                confirmedIds.has(notification.id) ? { ...notification, isRead: true } : notification
              ),
            }
          : previous
      );
      if (!requestedUnreadIds.every(id => confirmedIds.has(id))) {
        setStatusMessage('');
        setErrorMessage(tCommon('errors.generic'));
        return;
      }
      setStatusMessage(t('markedAllRead'));
    } catch (error) {
      if (
        activeSubscriberRef.current === mutationSubscriberId &&
        subscriberEpochRef.current === mutationSubscriberEpoch
      ) {
        console.error('Failed to mark all as read:', error);
        setStatusMessage('');
        setErrorMessage(tCommon('errors.generic'));
      }
    } finally {
      if (
        activeSubscriberRef.current === mutationSubscriberId &&
        subscriberEpochRef.current === mutationSubscriberEpoch
      ) {
        pendingAllRef.current = false;
        setPendingAll(false);
      }
    }
  };

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
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
      <DropdownMenuContent
        className="w-80 bg-background/95 backdrop-blur-xl border shadow-2xl z-50 rounded-xl max-h-[500px] flex flex-col"
        align="end"
      >
        <NotificationHeader
          unreadCount={unreadCount}
          pendingAll={pendingAll}
          pendingIds={pendingIds}
          onMarkAllAsRead={handleMarkAllAsRead}
        />

        <NotificationFeedback statusMessage={statusMessage} errorMessage={errorMessage} />

        <div className="overflow-y-auto overflow-x-hidden flex-1">
          <NotificationList
            loading={loading}
            notifications={notifications}
            pendingAll={pendingAll}
            pendingIds={pendingIds}
            onMarkAsRead={handleMarkAsRead}
            onClose={() => setIsOpen(false)}
          />
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
