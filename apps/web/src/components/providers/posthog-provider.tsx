'use client';

import { useCookieConsent } from '@/lib/cookie-consent';
import posthog from 'posthog-js';
import { PostHogProvider as PHProvider } from 'posthog-js/react';
import { useEffect, useRef } from 'react';

interface PostHogRuntimeConfig {
  enableAnalytics?: string;
  hostname?: string;
  nodeEnv?: string;
  posthogHost?: string;
  posthogKey?: string;
}

function isLocalObservationHost(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '0.0.0.0' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.127.0.0.1.nip.io')
  );
}

export function shouldEnablePosthog({
  enableAnalytics,
  hostname,
  nodeEnv,
  posthogHost,
  posthogKey,
}: PostHogRuntimeConfig): boolean {
  if (!posthogKey || !posthogHost) {
    return false;
  }

  if (enableAnalytics === 'false' || nodeEnv === 'development' || nodeEnv === 'test') {
    return false;
  }

  if (enableAnalytics === 'true') {
    return true;
  }

  if (hostname && isLocalObservationHost(hostname)) {
    return false;
  }

  return true;
}

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  const { consent } = useCookieConsent();
  const isInitialized = useRef(false);

  useEffect(() => {
    const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    const posthogHost = process.env.NEXT_PUBLIC_POSTHOG_HOST;
    const analyticsEnabled = shouldEnablePosthog({
      enableAnalytics: process.env.NEXT_PUBLIC_ENABLE_ANALYTICS,
      hostname: globalThis.location?.hostname,
      nodeEnv: process.env.NODE_ENV,
      posthogHost,
      posthogKey,
    });

    if (!analyticsEnabled) {
      if (isInitialized.current) {
        posthog.opt_out_capturing();
      }
      return;
    }

    if (consent !== 'accepted') {
      if (isInitialized.current) {
        posthog.opt_out_capturing();
      }
      return;
    }

    // Only initialize if the key is present (avoids errors in dev/test if missing)
    if (!isInitialized.current && posthogKey && posthogHost) {
      posthog.init(posthogKey, {
        api_host: posthogHost,
        person_profiles: 'identified_only', // Recommended for privacy/billing
        capture_pageview: false, // We will manually handle this for better control in Next.js
      });
      isInitialized.current = true;
    }

    posthog.opt_in_capturing();
  }, [consent]);

  return <PHProvider client={posthog}>{children}</PHProvider>;
}
