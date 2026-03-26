'use client';

import { authClient } from '@/lib/auth-client';
import { useEffect, useState } from 'react';
import { NotificationCenter } from './notification-center';

/**
 * NotificationBell - A self-contained notification bell that uses a provided subscriberId
 * when available, or falls back to fetching the user session to determine the subscriber.
 * Renders the NotificationCenter only when a valid subscriber/user id is available.
 */
export function NotificationBell({
  subscriberId,
  prefetchNotifications = true,
}: Readonly<{ subscriberId?: string | null; prefetchNotifications?: boolean }>) {
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(!subscriberId);

  useEffect(() => {
    if (subscriberId) {
      setUserId(subscriberId);
      setLoading(false);
      return;
    }

    async function fetchSession() {
      try {
        const session = await authClient.getSession();
        if (session?.data?.user?.id) {
          setUserId(session.data.user.id);
        }
      } catch (error) {
        console.error('Failed to fetch session for notifications:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchSession();
  }, [subscriberId]);

  // Don't render anything while loading or if not authenticated
  if (loading || !userId) {
    return null;
  }

  return <NotificationCenter subscriberId={userId} fetchOnMount={prefetchNotifications} />;
}
