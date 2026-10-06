export type DraftReadIdentity = Readonly<{
  ownerUserId: string | null;
  tenantId: string | null;
  editorGeneration: number;
  fingerprint: string;
}>;

type Options = Readonly<{
  current: () => DraftReadIdentity;
  onBusy: (pending: boolean) => void;
}>;

export type DraftReadController = Readonly<{
  run: <T>(
    operation: () => Promise<T>,
    accept: (value: T) => boolean,
    rejected?: () => void
  ) => Promise<boolean>;
  invalidate: () => void;
  dispose: () => void;
  isBusy: () => boolean;
}>;

// Logical supersession only: superseded retrievals are never physically cancelled and this
// module grants no access. It only decides whether a read receipt may still be observed.
export function createDraftReadController(options: Options): DraftReadController {
  let disposed = false;
  let counter = 0;
  let currentToken = 0;
  let busy = false;
  let busyOwner: DraftReadIdentity | null = null;

  const capture = (): DraftReadIdentity | null => {
    try {
      const { ownerUserId, tenantId, editorGeneration, fingerprint } = options.current();
      return { ownerUserId, tenantId, editorGeneration, fingerprint };
    } catch {
      return null; // fail closed
    }
  };
  const ownerMatches = (a: DraftReadIdentity, b: DraftReadIdentity) =>
    a.ownerUserId === b.ownerUserId &&
    a.tenantId === b.tenantId &&
    a.editorGeneration === b.editorGeneration;
  const ownerIsCurrent = (captured: DraftReadIdentity) => {
    const now = capture();
    return now !== null && ownerMatches(now, captured);
  };
  const isLive = (token: number, captured: DraftReadIdentity) => {
    if (disposed || currentToken !== token) return false;
    const now = capture();
    return now !== null && ownerMatches(now, captured) && now.fingerprint === captured.fingerprint;
  };
  const notifyBusy = (pending: boolean) => {
    try {
      options.onBusy(pending);
    } catch {
      // observer failures must not wedge the controller
    }
  };
  const clearBusy = (notify: boolean) => {
    busy = false;
    busyOwner = null;
    if (notify) notifyBusy(false);
  };

  async function run<T>(
    operation: () => Promise<T>,
    accept: (value: T) => boolean,
    rejected?: () => void
  ): Promise<boolean> {
    const captured = disposed ? null : capture();
    if (!captured) return false;
    const token = ++counter;
    currentToken = token;
    busyOwner = captured;
    if (!busy) {
      busy = true;
      notifyBusy(true);
    }
    try {
      let value: T;
      try {
        value = await operation();
      } catch {
        if (isLive(token, captured)) {
          try {
            rejected?.();
          } catch {
            // observer failures must not wedge the controller
          }
        }
        return false;
      }
      if (!isLive(token, captured)) return false;
      let accepted = false;
      try {
        accepted = accept(value) === true;
      } catch {
        accepted = false;
      }
      return accepted && isLive(token, captured);
    } finally {
      if (!disposed && currentToken === token) clearBusy(ownerIsCurrent(captured));
    }
  }

  function invalidate(): void {
    if (disposed) return;
    currentToken = ++counter;
    if (!busy) return;
    const owner = busyOwner;
    clearBusy(owner !== null && ownerIsCurrent(owner));
  }

  function dispose(): void {
    disposed = true;
    currentToken = ++counter;
    clearBusy(false);
  }

  return { run, invalidate, dispose, isBusy: () => !disposed && busy };
}
