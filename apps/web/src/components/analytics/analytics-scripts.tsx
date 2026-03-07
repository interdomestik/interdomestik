'use client';

import { useCookieConsent } from '@/lib/cookie-consent';
import Script from 'next/script';
import { useEffect, useRef, useState } from 'react';

type MetaPixelFunction = ((...args: unknown[]) => void) & {
  callMethod?: (...args: unknown[]) => void;
  queue: unknown[][];
  loaded?: boolean;
  version?: string;
  push?: (...args: unknown[]) => void;
};

type AnalyticsWindow = Window & {
  dataLayer?: Array<Record<string, unknown>>;
  fbq?: MetaPixelFunction;
  _fbq?: MetaPixelFunction;
};

export function AnalyticsScripts() {
  const { consent } = useCookieConsent();
  const GTM_ID = process.env.NEXT_PUBLIC_GTM_ID;
  const META_PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID;
  const gtmBootstrappedRef = useRef(false);
  const metaBootstrappedRef = useRef(false);
  const [isGtmReady, setIsGtmReady] = useState(false);

  useEffect(() => {
    if (consent !== 'accepted' || !GTM_ID) {
      setIsGtmReady(false);
      return;
    }

    if (gtmBootstrappedRef.current) {
      setIsGtmReady(true);
      return;
    }

    const analyticsWindow = globalThis as typeof globalThis & AnalyticsWindow;
    analyticsWindow.dataLayer = analyticsWindow.dataLayer ?? [];
    analyticsWindow.dataLayer.push({
      'gtm.start': Date.now(),
      event: 'gtm.js',
    });
    gtmBootstrappedRef.current = true;
    setIsGtmReady(true);
  }, [consent, GTM_ID]);

  useEffect(() => {
    if (consent !== 'accepted' || !META_PIXEL_ID || metaBootstrappedRef.current) {
      return;
    }

    const analyticsWindow = globalThis as typeof globalThis & AnalyticsWindow;
    if (!analyticsWindow.fbq) {
      const fbq = ((...args: unknown[]) => {
        if (fbq.callMethod) {
          fbq.callMethod(...args);
          return;
        }

        fbq.queue.push(args);
      }) as MetaPixelFunction;

      fbq.queue = [];
      fbq.loaded = true;
      fbq.version = '2.0';
      fbq.push = (...args: unknown[]) => fbq(...args);

      analyticsWindow.fbq = fbq;
      analyticsWindow._fbq = fbq;
    }

    metaBootstrappedRef.current = true;
  }, [consent, META_PIXEL_ID]);

  if (consent !== 'accepted') {
    return null;
  }

  return (
    <>
      {GTM_ID && isGtmReady && (
        <Script
          id="google-tag-manager-src"
          src={`https://www.googletagmanager.com/gtm.js?id=${GTM_ID}`}
          strategy="afterInteractive"
        />
      )}

      {META_PIXEL_ID && (
        <Script
          id="meta-pixel-src"
          src="https://connect.facebook.net/en_US/fbevents.js"
          strategy="afterInteractive"
          onLoad={() => {
            const analyticsWindow = globalThis as typeof globalThis & AnalyticsWindow;
            analyticsWindow.fbq?.('init', META_PIXEL_ID);
            analyticsWindow.fbq?.('track', 'PageView');
          }}
        />
      )}
    </>
  );
}
