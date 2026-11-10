'use client';

import { useEffect, type RefObject } from 'react';

export const CHROME_YIELD_HOLD_ATTRIBUTE = 'data-chrome-yield-hold';

const EDITING_SELECTOR = "input:not([type='hidden']), textarea, select, [contenteditable='true']";
// Fallback for a gesture whose click never arrives (scroll, drag or a cancelled tap).
const RELEASE_FALLBACK_MS = 400;

/**
 * Keeps the yielded mobile chrome for the whole pointer gesture that starts while an editable
 * field has focus. Pointer down blurs the field (WebKit does not focus the pressed button at all),
 * which would restore the sticky header under the pointer before pointer up and swallow the tap.
 */
export function useChromeYieldHold(root: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    let release: number | undefined;

    const releaseLater = (delay: number) => {
      window.clearTimeout(release);
      release = window.setTimeout(
        () => element.removeAttribute(CHROME_YIELD_HOLD_ATTRIBUTE),
        delay
      );
    };
    const hold = () => {
      const active = document.activeElement;
      if (!(active instanceof Element) || !element.contains(active)) return;
      if (!active.matches(EDITING_SELECTOR)) return;
      window.clearTimeout(release);
      element.setAttribute(CHROME_YIELD_HOLD_ATTRIBUTE, '');
    };
    const end = () => {
      if (element.hasAttribute(CHROME_YIELD_HOLD_ATTRIBUTE)) releaseLater(RELEASE_FALLBACK_MS);
    };
    // The click completes the gesture; release once it has been dispatched to its target.
    const clicked = () => {
      if (element.hasAttribute(CHROME_YIELD_HOLD_ATTRIBUTE)) releaseLater(0);
    };

    document.addEventListener('pointerdown', hold, true);
    document.addEventListener('pointerup', end, true);
    document.addEventListener('pointercancel', end, true);
    document.addEventListener('click', clicked, true);
    return () => {
      document.removeEventListener('pointerdown', hold, true);
      document.removeEventListener('pointerup', end, true);
      document.removeEventListener('pointercancel', end, true);
      document.removeEventListener('click', clicked, true);
      window.clearTimeout(release);
      element.removeAttribute(CHROME_YIELD_HOLD_ATTRIBUTE);
    };
  }, [root]);
}
