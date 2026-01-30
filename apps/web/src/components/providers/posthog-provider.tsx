'use client';

import posthog from 'posthog-js';
import { PostHogProvider as PHProvider } from 'posthog-js/react';
import { useEffect } from 'react';

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // Skip analytics in development to prevent console spam and API 404s
    if (process.env.NODE_ENV === 'development') {
      return;
    }

    // Only initialize if the key is present (avoids errors in dev/test if missing)
    if (process.env.NEXT_PUBLIC_POSTHOG_KEY && process.env.NEXT_PUBLIC_POSTHOG_HOST) {
      posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
        api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
        person_profiles: 'identified_only', // Recommended for privacy/billing
        capture_pageview: false, // We will manually handle this for better control in Next.js
      });
    }
  }, []);

  return <PHProvider client={posthog}>{children}</PHProvider>;
}
