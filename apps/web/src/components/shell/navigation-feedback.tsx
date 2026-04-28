'use client';

import { useSearchParams } from 'next/navigation';
import type { MouseEvent, ReactNode } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { usePathname } from '@/i18n/routing';

const NAVIGATION_FEEDBACK_TIMEOUT_MS = 10_000;
const CANCELLED_NAVIGATION_CLEAR_MS = 2_500;
const MIN_VISIBLE_NAVIGATION_FEEDBACK_MS = 200;
const NAVIGATION_FEEDBACK_IGNORE_SELECTOR = '[data-navigation-feedback="ignore"]';

function getClickedAnchor(target: EventTarget | null): HTMLAnchorElement | null {
  if (!(target instanceof Element)) {
    return null;
  }

  return target.closest('a[href]');
}

function isPrimaryNavigationClick(event: MouseEvent<HTMLElement>): boolean {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

function shouldTrackAnchor(anchor: HTMLAnchorElement, currentUrl: URL): boolean {
  if (anchor.target && anchor.target !== '_self') {
    return false;
  }

  if (anchor.hasAttribute('download')) {
    return false;
  }

  if (anchor.closest(NAVIGATION_FEEDBACK_IGNORE_SELECTOR)) {
    return false;
  }

  const href = anchor.getAttribute('href');
  if (!href || href.startsWith('#')) {
    return false;
  }

  const nextUrl = new URL(anchor.href, currentUrl);
  if (nextUrl.origin !== currentUrl.origin) {
    return false;
  }

  return nextUrl.pathname !== currentUrl.pathname || nextUrl.search !== currentUrl.search;
}

export function NavigationFeedback({ children }: Readonly<{ children: ReactNode }>): ReactNode {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = useMemo(() => searchParams.toString(), [searchParams]);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancellationCheckRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const routeClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastRouteKeyRef = useRef<string | null>(null);
  const pendingStartedAtRef = useRef<number>(0);
  const [isPending, setIsPending] = useState(false);

  function clearPendingTimer() {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }

  function clearCancellationCheck() {
    if (cancellationCheckRef.current) {
      clearTimeout(cancellationCheckRef.current);
      cancellationCheckRef.current = null;
    }
  }

  function clearRouteClearTimer() {
    if (routeClearRef.current) {
      clearTimeout(routeClearRef.current);
      routeClearRef.current = null;
    }
  }

  function clearNavigationTimers() {
    clearPendingTimer();
    clearCancellationCheck();
    clearRouteClearTimer();
  }

  useEffect(() => {
    const routeKey = `${pathname}?${search}`;
    const previousRouteKey = lastRouteKeyRef.current;
    lastRouteKeyRef.current = routeKey;

    if (previousRouteKey === null || previousRouteKey === routeKey) {
      return clearNavigationTimers;
    }

    clearNavigationTimers();

    const elapsedMs = Date.now() - pendingStartedAtRef.current;
    const remainingVisibleMs = Math.max(0, MIN_VISIBLE_NAVIGATION_FEEDBACK_MS - elapsedMs);

    if (remainingVisibleMs === 0) {
      setIsPending(false);
      return clearNavigationTimers;
    }

    routeClearRef.current = setTimeout(() => {
      setIsPending(false);
      routeClearRef.current = null;
    }, remainingVisibleMs);

    return clearNavigationTimers;
  }, [pathname, search]);

  function handleClick(event: MouseEvent<HTMLDivElement>) {
    if (!isPrimaryNavigationClick(event)) {
      return;
    }

    const anchor = getClickedAnchor(event.target);
    if (!anchor || !shouldTrackAnchor(anchor, new URL(window.location.href))) {
      return;
    }

    const startingHref = window.location.href;
    const nativeEvent = event.nativeEvent;

    clearNavigationTimers();
    pendingStartedAtRef.current = Date.now();
    setIsPending(true);
    timeoutRef.current = setTimeout(() => {
      setIsPending(false);
      timeoutRef.current = null;
    }, NAVIGATION_FEEDBACK_TIMEOUT_MS);

    cancellationCheckRef.current = setTimeout(() => {
      if (!event.defaultPrevented && !nativeEvent.defaultPrevented) {
        cancellationCheckRef.current = null;
        return;
      }

      cancellationCheckRef.current = setTimeout(() => {
        cancellationCheckRef.current = null;

        if (window.location.href !== startingHref) {
          return;
        }

        setIsPending(false);
        clearPendingTimer();
      }, CANCELLED_NAVIGATION_CLEAR_MS);
    }, 0);
  }

  return (
    <div onClickCapture={handleClick}>
      {isPending ? (
        <div
          aria-label="Loading page"
          aria-live="polite"
          className="fixed inset-x-0 top-0 z-[100] h-1 bg-primary/15"
          data-testid="portal-navigation-progress"
          role="status"
        >
          <div className="h-full w-1/3 animate-pulse rounded-r-full bg-primary shadow-[0_0_16px_rgba(14,116,144,0.45)]" />
          <span className="sr-only">Loading page</span>
        </div>
      ) : null}
      {children}
    </div>
  );
}
