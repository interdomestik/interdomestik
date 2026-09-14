'use client';

import { getNotifications, markAllAsRead, markAsRead } from '@/actions/notifications';
import { DropdownMenu, DropdownMenuContent } from '@interdomestik/ui';
import { useTranslations } from 'next-intl';
import {
  startTransition,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useOptimistic,
  useRef,
  useState,
} from 'react';

import type { Notification } from './notification-item';
import {
  NotificationFeedback,
  NotificationHeader,
  NotificationList,
  NotificationTrigger,
} from './notification-list';
interface NotificationCenterProps {
  readonly subscriberId: string;
  readonly fetchOnMount?: boolean;
}

interface NotificationSnapshot {
  readonly subscriberId: string;
  readonly epoch: number;
  readonly items: Notification[];
}

interface Acknowledgement extends Omit<NotificationSnapshot, 'items'> {
  readonly ids: ReadonlySet<string>;
}

function readSnapshot(snapshot: NotificationSnapshot, ack: Acknowledgement): NotificationSnapshot {
  if (snapshot.subscriberId !== ack.subscriberId || snapshot.epoch !== ack.epoch) return snapshot;
  return {
    ...snapshot,
    items: snapshot.items.map(item => (ack.ids.has(item.id) ? { ...item, isRead: true } : item)),
  };
}

interface LoadingState {
  readonly subscriberId: string;
  readonly active: boolean;
  readonly failed?: boolean;
}

export function NotificationCenter({ subscriberId, fetchOnMount = true }: NotificationCenterProps) {
  const t = useTranslations('notifications');
  const tCommon = useTranslations('common');
  const [snapshot, setSnapshot] = useState<NotificationSnapshot>({
    subscriberId,
    epoch: 0,
    items: [],
  });
  const [loadingState, setLoadingState] = useState<LoadingState>({
    subscriberId,
    active: fetchOnMount,
  });
  const [isOpen, setIsOpen] = useState(false);
  const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(new Set());
  const [pendingAll, setPendingAll] = useState(false);
  const [optimisticSnapshot, readOptimistically] = useOptimistic(
    snapshot,
    // React entangles concurrent Actions; settled failures must stop overlaying immediately.
    (base, ack: Acknowledgement) =>
      readSnapshot(base, {
        ...ack,
        ids: new Set([...ack.ids].filter(id => pendingAll || pendingIds.has(id))),
      })
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState('');
  const activeSubscriberRef = useRef(subscriberId);
  const subscriberEpochRef = useRef(0);
  const latestFetchRef = useRef(0);
  const inFlightFetchRef = useRef<{ subscriberId: string; epoch: number; id: number } | null>(null);
  const stateRevisionRef = useRef(0);
  const pendingIdsRef = useRef<ReadonlySet<string>>(new Set());
  const pendingAllRef = useRef(false);
  const previousOpenRef = useRef(false);
  const isOpenRef = useRef(isOpen);

  useLayoutEffect(() => {
    activeSubscriberRef.current = subscriberId;
    isOpenRef.current = isOpen;
  }, [isOpen, subscriberId]);

  const notifications =
    optimisticSnapshot.subscriberId === subscriberId ? optimisticSnapshot.items : [];
  const unreadCount = useMemo(
    () => notifications.filter(notification => !notification.isRead).length,
    [notifications]
  );
  const loading =
    loadingState.subscriberId === subscriberId ? loadingState.active : fetchOnMount || isOpen;

  const fetchInitialNotifications = useCallback(
    async function fetchNotifications() {
      const requestSubscriberId = subscriberId;
      const requestSubscriberEpoch = subscriberEpochRef.current;
      if (
        inFlightFetchRef.current?.subscriberId === requestSubscriberId &&
        inFlightFetchRef.current.epoch === requestSubscriberEpoch
      )
        return;
      const requestId = ++latestFetchRef.current;
      inFlightFetchRef.current = {
        subscriberId: requestSubscriberId,
        epoch: requestSubscriberEpoch,
        id: requestId,
      };
      const requestRevision = stateRevisionRef.current;
      let failed = false;
      setLoadingState({ subscriberId: requestSubscriberId, active: true });
      try {
        const data = (await getNotifications()) as unknown as Notification[];
        if (
          activeSubscriberRef.current === requestSubscriberId &&
          subscriberEpochRef.current === requestSubscriberEpoch &&
          latestFetchRef.current === requestId &&
          stateRevisionRef.current === requestRevision
        ) {
          setSnapshot({
            subscriberId: requestSubscriberId,
            epoch: requestSubscriberEpoch,
            items: data,
          });
        }
      } catch (error) {
        failed = true;
        if (activeSubscriberRef.current === requestSubscriberId) {
          console.error('Failed to fetch notifications:', error);
        }
      } finally {
        if (inFlightFetchRef.current?.id === requestId) inFlightFetchRef.current = null;
        if (
          activeSubscriberRef.current === requestSubscriberId &&
          subscriberEpochRef.current === requestSubscriberEpoch &&
          latestFetchRef.current === requestId
        ) {
          setLoadingState({ subscriberId: requestSubscriberId, active: false, failed });
          if (stateRevisionRef.current !== requestRevision) void fetchNotifications();
        }
      }
    },
    [subscriberId]
  );

  useEffect(() => {
    subscriberEpochRef.current += 1;
    pendingIdsRef.current = new Set();
    pendingAllRef.current = false;
    setPendingIds(new Set());
    setPendingAll(false);
    setErrorMessage(null);
    setStatusMessage('');
    setSnapshot({ subscriberId, epoch: subscriberEpochRef.current, items: [] });
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

  const acknowledge = async (id?: string): Promise<boolean> => {
    if (
      pendingAllRef.current ||
      (id ? pendingIdsRef.current.has(id) : pendingIdsRef.current.size > 0)
    )
      return false;

    const epoch = subscriberEpochRef.current;
    const ids = new Set(
      id ? [id] : notifications.filter(notification => !notification.isRead).map(item => item.id)
    );
    const acknowledgement = { subscriberId, epoch, ids };
    const isCurrent = () =>
      activeSubscriberRef.current === subscriberId && subscriberEpochRef.current === epoch;
    if (id) {
      pendingIdsRef.current = new Set(pendingIdsRef.current).add(id);
      setPendingIds(pendingIdsRef.current);
    } else {
      pendingAllRef.current = true;
      setPendingIds(ids);
      setPendingAll(true);
    }
    setErrorMessage(null);
    setStatusMessage(tCommon('processing'));
    stateRevisionRef.current += 1;

    return new Promise(resolve => {
      startTransition(async () => {
        readOptimistically(acknowledgement);
        let confirmed = false;
        try {
          const result = id ? await markAsRead(id) : await markAllAsRead();
          if (!isCurrent()) return;
          confirmed =
            result.success && (!id || ('notificationId' in result && result.notificationId === id));
          if (!confirmed) {
            setStatusMessage('');
            setErrorMessage(tCommon('errors.generic'));
            return;
          }
          stateRevisionRef.current += 1;
          setSnapshot(previous => readSnapshot(previous, acknowledgement));
          setErrorMessage(null);
          setStatusMessage(t(id ? 'markedRead' : 'markedAllRead'));
          if (!id) void fetchInitialNotifications();
        } catch (error) {
          if (isCurrent()) {
            console.error('Failed to acknowledge notifications:', error);
            setStatusMessage('');
            setErrorMessage(tCommon('errors.generic'));
          }
        } finally {
          if (isCurrent()) {
            if (id) {
              const remaining = new Set(pendingIdsRef.current);
              remaining.delete(id);
              pendingIdsRef.current = remaining;
              setPendingIds(remaining);
            } else {
              pendingAllRef.current = false;
              setPendingIds(new Set());
              setPendingAll(false);
            }
          }
          resolve(confirmed);
        }
      });
    });
  };

  const handleMarkAsRead = async (id: string, event?: React.MouseEvent) => {
    event?.preventDefault();
    event?.stopPropagation();
    return acknowledge(id);
  };

  const handleMarkAllAsRead = async (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    await acknowledge();
  };
  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <NotificationTrigger unreadCount={unreadCount} />
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
            fetchFailed={loadingState.subscriberId === subscriberId && loadingState.failed === true}
            onRetry={fetchInitialNotifications}
            notifications={notifications}
            pendingIds={pendingIds}
            pendingAll={pendingAll}
            onMarkAsRead={handleMarkAsRead}
            onClose={() => setIsOpen(false)}
          />
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
