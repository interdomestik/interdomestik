'use client';

import { Inbox } from '@novu/nextjs';

interface NotificationCenterProps {
  subscriberId: string;
  subscriberHash?: string;
}

/**
 * NotificationCenter - In-app notification bell using Novu's Inbox component
 *
 * This component renders a notification bell icon that opens a popover
 * showing the user's notifications. It integrates with Novu's managed
 * notification infrastructure.
 *
 * @requires NEXT_PUBLIC_NOVU_APP_ID environment variable
 */
export function NotificationCenter({ subscriberId, subscriberHash }: NotificationCenterProps) {
  const appId = process.env.NEXT_PUBLIC_NOVU_APP_ID;

  if (!appId) {
    console.warn('NotificationCenter: NEXT_PUBLIC_NOVU_APP_ID is not set');
    return null;
  }

  return (
    <Inbox
      applicationIdentifier={appId}
      subscriberId={subscriberId}
      subscriberHash={subscriberHash}
    />
  );
}
