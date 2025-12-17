'use client';

import { createAuthClient } from 'better-auth/react';
import { useEffect, useState } from 'react';
import { NotificationCenter } from './notification-center';

const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
});

/**
 * NotificationBell - A self-contained notification bell that fetches user session
 * and renders the NotificationCenter if the user is authenticated.
 */
export function NotificationBell() {
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
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
  }, []);

  // Don't render anything while loading or if not authenticated
  if (loading || !userId) {
    return null;
  }

  return <NotificationCenter subscriberId={userId} />;
}
