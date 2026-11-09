import type { RefObject } from 'react';

export type PendingSheetOpener = Readonly<{ element: HTMLElement }>;

export function recordMobileSheetOpener(
  pendingOpener: RefObject<PendingSheetOpener | null>,
  element: HTMLElement,
  opening: boolean
): void {
  const pending = opening ? { element } : null;
  pendingOpener.current = pending;
  if (!pending) return;

  // Autofocus must consume this opening's capture before the next task.
  setTimeout(() => {
    if (pendingOpener.current === pending) pendingOpener.current = null;
  }, 0);
}

export function canRestoreMobileSheetFocus(element: HTMLElement | null): element is HTMLElement {
  if (!element?.isConnected || element === document.body) return false;
  if (element.closest('[hidden], [inert], [aria-hidden="true"]')) return false;
  if (element.matches(':disabled, input[type="hidden"]')) return false;
  const focusable =
    element.tabIndex >= 0 ||
    element.hasAttribute('tabindex') ||
    element.matches('[contenteditable]:not([contenteditable="false"])');
  if (!focusable) return false;

  let ancestor: HTMLElement | null = element;
  while (ancestor) {
    const { display, visibility } = getComputedStyle(ancestor);
    if (display === 'none' || visibility === 'hidden' || visibility === 'collapse') return false;
    ancestor = ancestor.parentElement;
  }
  return true;
}
