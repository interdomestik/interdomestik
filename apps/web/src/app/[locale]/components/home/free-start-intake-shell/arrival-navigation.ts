import type { MouseEvent } from 'react';

export function isOrdinaryActivation(event: MouseEvent<HTMLAnchorElement>): boolean {
  return (
    !event.defaultPrevented &&
    event.button === 0 &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey &&
    (!event.currentTarget.target || event.currentTarget.target === '_self')
  );
}

export function setArrivalScrollMargin(target: HTMLElement): void {
  const header = document.querySelector<HTMLElement>('[data-testid="public-header"]');
  if (header) target.style.scrollMarginTop = `${header.offsetHeight + 16}px`;
}

/** Native fragment navigation owns history and scrolling; focus never summons a keyboard. */
export function focusFragmentTarget(event: MouseEvent<HTMLAnchorElement>): void {
  if (!isOrdinaryActivation(event)) return;
  const target = document.getElementById(event.currentTarget.hash.slice(1));
  if (!target) return;
  setArrivalScrollMargin(target);
  target.focus({ preventScroll: true });
}
