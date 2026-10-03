'use client';

import { useEffect } from 'react';
import { normalizeRoutePath, type SearchPendingKind } from './responsive-search-policy';

/** Explicit "a real navigation starts now" notification, for the code paths
 * that call the router directly: a click listener cannot observe a
 * programmatic push, so those paths announce it instead. This is a narrow
 * notification, not an interception: nothing here patches or blocks a router. */
export const SIBLING_NAVIGATION_EVENT = 'interdomestik:sibling-navigation';

/** Opt-out marker for the few anchors that take their own navigation over:
 * they preventDefault in their click handler and push later, or never, once an
 * asynchronous step succeeds. The listener below runs in the capture phase, so
 * it cannot see that later preventDefault; such an anchor therefore declares
 * itself inert here and announces its navigation with notifySiblingNavigation
 * at the moment the push actually happens. Capture has to stay capture because
 * NextLink itself preventDefaults after this listener has run, so defaultPrevented
 * is not an available signal. */
export const MANUAL_NAVIGATION_ATTRIBUTE = 'data-manual-navigation';

export type SiblingNavigationDetail = { href?: string };

export type SiblingNavigationCancel = (nextPendingKind?: SearchPendingKind | null) => void;

export function notifySiblingNavigation(href?: string): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<SiblingNavigationDetail>(SIBLING_NAVIGATION_EVENT, { detail: { href } })
  );
}

// Centralised "an actual sibling navigation started" signal for coalesced
// search work. It observes clicks in the capture phase, so it cannot see a
// preventDefault that a later handler will call; inert links are therefore
// excluded by attribute, exactly as the member claims listener established.
// This listener never calls preventDefault and never blocks a navigation.
export function useSiblingNavigationCancel(cancel: SiblingNavigationCancel): void {
  useEffect(() => {
    const cancelForLink = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (
        !(anchor instanceof HTMLAnchorElement) ||
        anchor.hasAttribute('download') ||
        anchor.hasAttribute('disabled') ||
        anchor.getAttribute('aria-disabled') === 'true' ||
        // The anchor drives its own push and will announce it explicitly.
        anchor.dataset.manualNavigation === 'true' ||
        (anchor.target && anchor.target !== '_self')
      )
        return;
      const current = new URL(window.location.href);
      const next = new URL(anchor.href, current);
      // Same origin and a different page or query: hash-only links stay queued.
      if (
        next.origin === current.origin &&
        (next.pathname !== current.pathname || next.search !== current.search)
      )
        cancel();
    };
    const cancelForSignal = (event: Event) => {
      const detail = (event as CustomEvent<SiblingNavigationDetail>).detail;
      if (!detail?.href) {
        cancel();
        return;
      }
      const current = new URL(window.location.href);
      const next = new URL(detail.href, current);
      // The explicit navigation keeps this url: there will be no echo to wait
      // for, so queued work is dropped and the feedback settles immediately.
      const isSameUrl =
        next.origin === current.origin &&
        normalizeRoutePath(next.pathname) === normalizeRoutePath(current.pathname) &&
        next.search === current.search;
      cancel(isSameUrl ? null : 'filter');
    };
    document.addEventListener('click', cancelForLink, true);
    window.addEventListener(SIBLING_NAVIGATION_EVENT, cancelForSignal);
    return () => {
      document.removeEventListener('click', cancelForLink, true);
      window.removeEventListener(SIBLING_NAVIGATION_EVENT, cancelForSignal);
    };
  }, [cancel]);
}
