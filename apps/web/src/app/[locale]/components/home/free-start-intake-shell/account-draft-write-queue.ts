import { normalizeFreeStartDraftText } from '@/lib/validators/free-start-draft';
import type { DraftSaveState, IssueId, OutcomeId, SavedDraft } from './types';

export type DraftWritePayload = Readonly<{
  category: 'vehicle' | 'property';
  counterparty?: string;
  desiredOutcome?: OutcomeId;
  incidentDate?: string;
  issueType?: IssueId;
  resumeStep: 'category' | 'details' | 'preview';
  summary?: string;
}>;

export type DraftWriteSnapshot = Readonly<{ fingerprint: string; payload: DraftWritePayload }>;
export type DraftQueueContext = Readonly<{ ownerUserId: string; tenantId: string }>;
export type DraftWriteResult = { ok: true; draft: SavedDraft } | { ok: false; code: string };
export type DraftCreateRequest = DraftWritePayload &
  Readonly<{ clientRequestId: string; expectedContext: DraftQueueContext }>;
export type DraftUpdateRequest = DraftWritePayload &
  Readonly<{ id: string; expectedVersion: number; expectedContext: DraftQueueContext }>;

export type AccountDraftWriteQueueOptions = {
  expectedContext: DraftQueueContext;
  clientRequestId: string;
  create: (payload: DraftCreateRequest) => Promise<DraftWriteResult>;
  update: (payload: DraftUpdateRequest) => Promise<DraftWriteResult>;
  onState: (state: DraftSaveState) => void;
  onAck: (draft: SavedDraft, fingerprint: string, current: boolean) => void;
  /** A definite refusal's original code, observed only after the failure is stored. */
  onRefused?: (code: string) => void;
};

export type AccountDraftWriteQueue = {
  enqueue: (snapshot: DraftWriteSnapshot) => void;
  retry: () => void;
  drain: () => Promise<boolean>;
  /** `recover` holds open only a known divergent create replay for authoritative resume. */
  retire: (recover?: boolean) => Promise<boolean | 'recovering'>;
  dispose: () => void;
  /** Ends admission (enqueue, retry, adopt, retire) but keeps serializing the already-owned
   * latest write on each acknowledged version until quiescent, then disposes. Never retries. */
  settle: () => Promise<void>;
  adopt: (draft: SavedDraft) => boolean;
  getDraft: () => SavedDraft | null;
  getAcknowledgedFingerprint: () => string | null;
  restoreKnownFailure: () => boolean;
  getWriteFeedback: () => DraftSaveState | null;
};

// A create answered with this code (or a thrown error) may have committed on the server with
// the receipt lost, so the original request must be replayed verbatim before identity is known.
const UNCERTAIN_CREATE_CODE = 'unavailable';

function failureState(code: string): DraftSaveState {
  if (code === 'invalid') return 'invalid';
  if (code === 'unavailableAccountContext') return 'accountContext';
  if (code === 'limitReached') return 'limit';
  return 'error';
}

const OPTIONAL_FACTS = [
  'counterparty',
  'desiredOutcome',
  'incidentDate',
  'issueType',
  'summary',
] as const;

function normalized(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  return normalizeFreeStartDraftText(value);
}

// An uncertain create replays the original request, so the server may answer with a row that
// another tab already changed; only the facts the original request supplied are compared.
function matchesOriginalCreate(row: SavedDraft, original: DraftWritePayload): boolean {
  if (row.version !== 1) return false;
  if (row.category !== original.category || row.resumeStep !== original.resumeStep) return false;
  return OPTIONAL_FACTS.every(
    key => original[key] === undefined || normalized(original[key]) === normalized(row[key])
  );
}

type Waiter = { ready: () => boolean; resolve: () => void };

export function createAccountDraftWriteQueue(
  options: AccountDraftWriteQueueOptions
): AccountDraftWriteQueue {
  const { clientRequestId } = options;
  const expectedContext: DraftQueueContext = Object.freeze({
    ownerUserId: options.expectedContext.ownerUserId,
    tenantId: options.expectedContext.tenantId,
  });
  const waiters: Waiter[] = [];
  let draft: SavedDraft | null = null;
  let latest: DraftWriteSnapshot | null = null;
  let ackedFingerprint: string | null = null;
  let uncertainCreate: DraftWriteSnapshot | null = null;
  let failed: DraftSaveState | null = null;
  let inflight = false;
  let retiring = false;
  let closed = false;
  let disposed = false;
  let sealed = false;

  const live = () => !disposed && !closed;
  const admitting = () => live() && !sealed;
  const hasPending = () => latest !== null && latest.fingerprint !== ackedFingerprint;
  const quiescent = () => !inflight && (disposed || closed || failed !== null || !hasPending());

  function flush(): void {
    // Resolving a waiter splices the live array; iterate a stable snapshot.
    for (const waiter of waiters.slice()) {
      if (!waiter.ready()) continue;
      waiters.splice(waiters.indexOf(waiter), 1);
      waiter.resolve();
    }
  }

  function waitUntil(ready: () => boolean): Promise<void> {
    if (ready()) return Promise.resolve();
    return new Promise(resolve => waiters.push({ ready, resolve }));
  }

  function notify(callback: () => void): void {
    if (!live()) return;
    try {
      callback();
    } catch {
      // an observer failure must not wedge the serialized queue
    }
  }

  const emitState = (state: DraftSaveState) => notify(() => options.onState(state));

  function accept(next: SavedDraft, written: DraftWriteSnapshot): void {
    draft = next;
    ackedFingerprint = written.fingerprint;
    uncertainCreate = null;
    failed = null;
    const current = latest?.fingerprint === written.fingerprint;
    notify(() => options.onAck(next, written.fingerprint, current));
    if (retiring) return;
    if (current) return emitState('saved');
    emitState('dirty');
    pump();
  }

  function reject(
    code: string,
    thrown: boolean,
    written: DraftWriteSnapshot,
    wasCreate: boolean
  ): void {
    if (wasCreate && (thrown || code === UNCERTAIN_CREATE_CODE)) uncertainCreate = written;
    if (!wasCreate && !thrown && code === 'conflict') failed = 'conflict';
    else failed = thrown ? 'error' : failureState(code);
    emitState(failed);
    if (!thrown) notify(() => options.onRefused?.(code));
  }

  async function run(): Promise<void> {
    const base = draft;
    const written = base ? latest : (uncertainCreate ?? latest);
    if (!written) return;
    inflight = true;
    emitState('saving');
    let result: DraftWriteResult;
    let thrown = false;
    try {
      result = base
        ? await options.update({
            ...written.payload,
            id: base.id,
            expectedVersion: base.version,
            expectedContext,
          })
        : await options.create({ ...written.payload, clientRequestId, expectedContext });
    } catch {
      thrown = true;
      result = { ok: false, code: 'thrown' };
    }
    inflight = false;
    if (!disposed) {
      const replayDiverged =
        result.ok &&
        base === null &&
        written === uncertainCreate &&
        !matchesOriginalCreate(result.draft, written.payload);
      if (replayDiverged) {
        failed = 'conflict';
        emitState('conflict');
      } else if (result.ok) accept(result.draft, written);
      else reject(result.code, thrown, written, base === null);
    }
    flush();
  }

  function pump(): void {
    if (!live() || retiring || inflight || failed !== null) return;
    if (uncertainCreate === null && !hasPending()) return;
    void run();
  }

  return {
    enqueue(snapshot) {
      if (!admitting()) return;
      latest = { fingerprint: snapshot.fingerprint, payload: { ...snapshot.payload } };
      pump();
    },
    retry() {
      if (!admitting() || retiring || inflight || failed === null || failed === 'conflict') return;
      failed = null;
      if (uncertainCreate === null && !hasPending()) {
        emitState(draft ? 'saved' : 'idle');
        flush();
        return;
      }
      pump();
    },
    async drain() {
      await waitUntil(quiescent);
      return !disposed && failed === null && !hasPending();
    },
    async retire(recover = false) {
      if (closed) return true;
      if (sealed) return false; // a settling queue only completes writes it already owns
      retiring = true;
      await waitUntil(() => !inflight);
      if (closed) return true;
      // uncertainCreate + conflict means a successful replay proved the create committed under a
      // known row. Only deliberate authoritative resume may hold that frozen queue open (it cannot
      // write until adopt), so a failed recovery never creates again. A still-unknown commit
      // (thrown/unavailable without a successful replay) always refuses.
      const held = recover && !disposed && uncertainCreate !== null && failed === 'conflict';
      if (held || disposed || uncertainCreate !== null) {
        retiring = false;
        flush();
        return held ? 'recovering' : false;
      }
      closed = true;
      flush();
      return true;
    },
    dispose() {
      disposed = true;
      flush();
    },
    async settle() {
      sealed = true;
      await waitUntil(quiescent);
      disposed = true;
      flush();
    },
    adopt(next) {
      const createConflict = uncertainCreate !== null && failed === 'conflict';
      if (!admitting() || retiring || inflight) return false;
      if (uncertainCreate !== null && !createConflict) return false;
      if (hasPending() && failed !== 'conflict') return false;
      draft = next;
      uncertainCreate = null;
      ackedFingerprint = null;
      latest = null;
      failed = null;
      flush();
      return true;
    },
    restoreKnownFailure() {
      if (
        !closed ||
        inflight ||
        disposed ||
        sealed ||
        draft === null ||
        uncertainCreate !== null ||
        failed === null
      )
        return false;
      // Fresh owner admission can expose explicit retry; failed still prevents the pump.
      closed = false;
      retiring = false;
      return true;
    },
    getDraft: () => draft,
    getAcknowledgedFingerprint: () => ackedFingerprint,
    getWriteFeedback: () => (inflight ? 'saving' : failed),
  };
}
