import { useCallback, useEffect, useRef } from 'react';

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

/**
 * Reloads the page once the shown confirmation could be read. The returned promise settles when the
 * reload starts or is cancelled, so a transition awaiting it keeps the mutation controls locked for
 * the whole wait. Unmounting or switching to another claim cancels the pending reload.
 */
export function useDeferredAssignmentReload(claimId: string): () => Promise<void> {
  const cancelPending = useRef<(() => void) | null>(null);
  useEffect(() => {
    const pending = cancelPending;
    return () => pending.current?.();
  }, [claimId]);
  return useCallback(() => {
    cancelPending.current?.();
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
}
