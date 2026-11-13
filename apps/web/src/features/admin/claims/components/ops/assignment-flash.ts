import { useCallback, useEffect, useMemo, useRef } from 'react';

// A committed assignment reloads the page (the gate proof waits for that load), which would drop a
// toast shown before it. The confirmation is therefore carried across the reload once, per tab.
const ASSIGNMENT_FLASH_KEY = 'interdomestik:admin-claim-assignment-saved';
/** How long the confirmation stays readable before the reload when it cannot be carried across. */
export const ASSIGNMENT_TOAST_READ_MS = 2500;

function readStorage(): Storage | null {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
}

/** Remembers a saved assignment for the claim; false when the browser blocks session storage. */
export function rememberAssignmentFlash(claimId: string): boolean {
  try {
    const storage = readStorage();
    if (!storage) return false;
    storage.setItem(ASSIGNMENT_FLASH_KEY, claimId);
    return true;
  } catch {
    return false;
  }
}

/** True exactly once after a saved assignment of this claim; other claims never consume it. */
export function consumeAssignmentFlash(claimId: string): boolean {
  try {
    const storage = readStorage();
    if (storage?.getItem(ASSIGNMENT_FLASH_KEY) !== claimId) return false;
    storage.removeItem(ASSIGNMENT_FLASH_KEY);
    return true;
  } catch {
    return false;
  }
}

/**
 * Shows the remembered confirmation once per mounted claim, i.e. after the reload. The check is
 * deferred to a task so the root toaster has subscribed, and it never repeats on later renders of
 * the same page, which still exists between the save and the reload.
 */
export function useAssignmentFlashToast(claimId: string, show: () => void): void {
  const checkedClaimId = useRef<string | null>(null);
  useEffect(() => {
    if (checkedClaimId.current === claimId) return undefined;
    const timer = globalThis.setTimeout(() => {
      checkedClaimId.current = claimId;
      if (consumeAssignmentFlash(claimId)) show();
    }, 0);
    return () => globalThis.clearTimeout(timer);
  }, [claimId, show]);
}

export type AssignmentReload = Readonly<{
  /** False once the card that started the save has unmounted or switched to another claim. */
  isCurrent: (claimId: string) => boolean;
  /**
   * Reloads the page once the shown confirmation could be read. The promise settles when the
   * reload starts or is cancelled, so a transition awaiting it keeps the mutation controls locked
   * for the whole wait. Unmounting or switching to another claim cancels it; a call for a claim
   * that is no longer current never schedules a reload.
   */
  reloadAfterToast: (claimId: string) => Promise<void>;
}>;

export function useDeferredAssignmentReload(claimId: string): AssignmentReload {
  const currentClaimId = useRef<string | null>(null);
  const cancelPending = useRef<(() => void) | null>(null);
  useEffect(() => {
    const current = currentClaimId;
    const pending = cancelPending;
    current.current = claimId;
    return () => {
      current.current = null;
      pending.current?.();
    };
  }, [claimId]);
  const isCurrent = useCallback((id: string) => currentClaimId.current === id, []);
  const reloadAfterToast = useCallback((id: string) => {
    cancelPending.current?.();
    if (currentClaimId.current !== id) return Promise.resolve();
    return new Promise<void>(resolve => {
      const timer = globalThis.setTimeout(() => {
        cancelPending.current = null;
        globalThis.location.reload();
        resolve();
      }, ASSIGNMENT_TOAST_READ_MS);
      cancelPending.current = () => {
        globalThis.clearTimeout(timer);
        cancelPending.current = null;
        resolve();
      };
    });
  }, []);
  return useMemo(() => ({ isCurrent, reloadAfterToast }), [isCurrent, reloadAfterToast]);
}
