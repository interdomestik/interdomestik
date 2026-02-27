'use client';

import { useCookieConsent } from '@/lib/cookie-consent';
import posthog from 'posthog-js';
import { PostHogProvider as PHProvider } from 'posthog-js/react';
import { useEffect, useRef } from 'react';

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  const { consent } = useCookieConsent();
  const isInitialized = useRef(false);

  useEffect(() => {
    // Skip analytics in development to prevent console spam and API 404s
    if (process.env.NODE_ENV === 'development') {
      return;
    }

    if (consent !== 'accepted') {
      if (isInitialized.current) {
        posthog.opt_out_capturing();
      }
      return;
    }

    // Only initialize if the key is present (avoids errors in dev/test if missing)
    if (
      !isInitialized.current &&
      process.env.NEXT_PUBLIC_POSTHOG_KEY &&
      process.env.NEXT_PUBLIC_POSTHOG_HOST
    ) {
      posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
        api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
        person_profiles: 'identified_only', // Recommended for privacy/billing
        capture_pageview: false, // We will manually handle this for better control in Next.js
      });
      isInitialized.current = true;
    }

    posthog.opt_in_capturing();
  }, [consent]);

  return <PHProvider client={posthog}>{children}</PHProvider>;
}
