import { freeStartDraftPayloadSchema } from '@/lib/validators/free-start-draft';
import { z } from 'zod';

import type { CategoryId, DraftState, StepId } from './types';

export const ANONYMOUS_DRAFT_KEY = 'interdomestik_free_start_recovery_v1';
export const ANONYMOUS_DRAFT_LOCK_NAME = 'interdomestik:free-start:anonymous-draft:v1';
export const ANONYMOUS_DRAFT_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const storedRecordSchema = z
  .object({
    version: z.literal(1),
    draft: freeStartDraftPayloadSchema,
    updatedAt: z.string(),
    expiresAt: z.string(),
  })
  .strict();

export type AnonymousDraftSnapshot = Readonly<{
  category: 'vehicle' | 'property';
  draft: DraftState;
  resumeStep: 'category' | 'details' | 'preview';
}>;
export type AnonymousDraftRecord = AnonymousDraftSnapshot &
  Readonly<{ updatedAt: string; expiresAt: string }>;
type RecoveryStorage = Pick<Storage, 'getItem' | 'removeItem' | 'setItem'>;
// prettier-ignore
type Locks = Readonly<{ request: <T>(name: string, options: { mode: 'exclusive'; signal: AbortSignal }, callback: () => T | Promise<T>) => Promise<T> }>;
// prettier-ignore
export type ReadResult = { status: 'available'; record: AnonymousDraftRecord } | { status: 'none' } | { status: 'invalid' } | { status: 'unavailable' };
export type WriteResult =
  | { status: 'saved'; record: AnonymousDraftRecord }
  | { status: 'conflict'; record: AnonymousDraftRecord }
  | { status: 'stale' | 'unavailable' };
export type RemoveResult =
  | { status: 'changed'; record: AnonymousDraftRecord }
  | { status: 'invalid' | 'none' | 'removed' | 'unavailable' };
export type LockedResult<T> = { status: 'acquired'; value: T } | { status: 'unavailable' };
// prettier-ignore
function getLocks(): Locks | null { try { return typeof navigator === 'undefined' ? null : ((navigator as Navigator & { locks?: Locks }).locks ?? null); } catch { return null; } }
export async function runAnonymousDraftLocked<T>(
  task: () => T,
  externalSignal?: AbortSignal
): Promise<LockedResult<T>> {
  const locks = getLocks();
  if (!locks) return { status: 'unavailable' };
  const controller = new AbortController();
  let granted = false;
  const abortPending = () => {
    if (!granted) controller.abort();
  };
  let timeout: ReturnType<typeof setTimeout> | undefined;
  // prettier-ignore
  try {
    if (externalSignal?.aborted) abortPending();
    else externalSignal?.addEventListener('abort', abortPending, { once: true });
    timeout = globalThis.setTimeout(abortPending, 5_000);
    const value = await locks.request(
      ANONYMOUS_DRAFT_LOCK_NAME,
      { mode: 'exclusive', signal: controller.signal },
      async () => {
        granted = true;
        globalThis.clearTimeout(timeout);
        // Let Firefox expose prior cross-context storage writes before this mutation reads.
        await new Promise<void>(resolve => globalThis.setTimeout(resolve, 0));
        await new Promise<void>(resolve => globalThis.setTimeout(resolve, 0));
        return task();
      }
    );
    return { status: 'acquired', value };
  } catch {
    return { status: 'unavailable' };
  } finally {
    try { if (timeout !== undefined) globalThis.clearTimeout(timeout); } catch {}
    try { externalSignal?.removeEventListener('abort', abortPending); } catch {}
  }
}
// prettier-ignore
export function getAnonymousDraftStorage(): RecoveryStorage | null { try { return globalThis.localStorage; } catch { return null; } }
// prettier-ignore
function snapshotFromPayload(value: z.infer<typeof freeStartDraftPayloadSchema>): AnonymousDraftSnapshot { return { category: value.category, draft: { counterparty: value.counterparty ?? '', desiredOutcome: value.desiredOutcome ?? '', incidentDate: value.incidentDate ?? '', issueType: value.issueType ?? '', summary: value.summary ?? '' }, resumeStep: value.resumeStep }; }
// prettier-ignore
export function createAnonymousDraftSnapshot(category: CategoryId, draft: DraftState, step: StepId): AnonymousDraftSnapshot | null { if (category !== 'vehicle' && category !== 'property') return null; const parsed = freeStartDraftPayloadSchema.safeParse({ category, counterparty: draft.counterparty || undefined, desiredOutcome: draft.desiredOutcome || undefined, incidentDate: draft.incidentDate || undefined, issueType: draft.issueType || undefined, resumeStep: step === 'complete' ? 'preview' : step, summary: draft.summary || undefined }); return parsed.success ? snapshotFromPayload(parsed.data) : null; }
// prettier-ignore
export function sameAnonymousDraftRecord(left: AnonymousDraftRecord, right: AnonymousDraftRecord) { return JSON.stringify(left) === JSON.stringify(right); }
function decode(raw: string, now: number): AnonymousDraftRecord | null {
  try {
    const input: unknown = JSON.parse(raw);
    const draft = input && typeof input === 'object' ? (input as { draft?: unknown }).draft : null;
    if (!draft || typeof draft !== 'object' || !Object.hasOwn(draft, 'resumeStep')) return null;
    const parsed = storedRecordSchema.safeParse(input);
    if (!parsed.success) return null;
    const updatedAt = Date.parse(parsed.data.updatedAt);
    const expiresAt = Date.parse(parsed.data.expiresAt);
    if (
      !Number.isFinite(updatedAt) ||
      !Number.isFinite(expiresAt) ||
      updatedAt > now + 60_000 ||
      expiresAt <= now ||
      expiresAt - updatedAt !== ANONYMOUS_DRAFT_TTL_MS
    )
      return null;
    return {
      ...snapshotFromPayload(parsed.data.draft),
      updatedAt: parsed.data.updatedAt,
      expiresAt: parsed.data.expiresAt,
    };
  } catch {
    return null;
  }
}
// prettier-ignore
export function readAnonymousDraft(storage: RecoveryStorage | null, now = Date.now()): ReadResult {
  if (!storage) return { status: 'unavailable' };
  try {
    const raw = storage.getItem(ANONYMOUS_DRAFT_KEY);
    if (raw === null) return { status: 'none' };
    const record = decode(raw, now);
    if (record) return { status: 'available', record };
    try { storage.removeItem(ANONYMOUS_DRAFT_KEY); return { status: 'none' }; } catch { return { status: 'invalid' }; }
  } catch {
    return { status: 'unavailable' };
  }
}

// prettier-ignore
export function writeAnonymousDraft(storage: RecoveryStorage | null, snapshot: AnonymousDraftSnapshot, expected: AnonymousDraftRecord | null, orderingNow = Date.now(), executionNow = Date.now()): WriteResult {
  if (!storage) return { status: 'unavailable' };
  if (!Number.isFinite(orderingNow) || !Number.isFinite(executionNow)) return { status: 'unavailable' };
  if (orderingNow > executionNow + 60_000 || orderingNow + ANONYMOUS_DRAFT_TTL_MS <= executionNow) return { status: 'stale' };
  const current = readAnonymousDraft(storage, executionNow);
  if (current.status === 'unavailable' || current.status === 'invalid') return { status: 'unavailable' };
  if (current.status === 'none' && expected && orderingNow < Date.parse(expected.updatedAt)) return { status: 'stale' };
  if (current.status === 'available' && (!expected || !sameAnonymousDraftRecord(current.record, expected)) && Date.parse(current.record.updatedAt) >= orderingNow) return { status: 'conflict', record: current.record };
  const canonical = createAnonymousDraftSnapshot(snapshot.category, snapshot.draft, snapshot.resumeStep);
  if (!canonical) return { status: 'unavailable' };
  const basis = current.status === 'available' ? current.record : expected;
  const revision = basis ? Math.max(orderingNow, Date.parse(basis.updatedAt) + 1) : orderingNow;
  if (revision > executionNow + 60_000 || revision + ANONYMOUS_DRAFT_TTL_MS <= executionNow) return current.status === 'available' ? { status: 'conflict', record: current.record } : { status: 'stale' };
  const draft = { category: canonical.category, counterparty: canonical.draft.counterparty || undefined, desiredOutcome: canonical.draft.desiredOutcome || undefined, incidentDate: canonical.draft.incidentDate || undefined, issueType: canonical.draft.issueType || undefined, resumeStep: canonical.resumeStep, summary: canonical.draft.summary || undefined };
  const data = storedRecordSchema.safeParse({ version: 1, draft, updatedAt: new Date(revision).toISOString(), expiresAt: new Date(revision + ANONYMOUS_DRAFT_TTL_MS).toISOString() });
  if (!data.success) return { status: 'unavailable' };
  const saved = decode(JSON.stringify(data.data), executionNow);
  if (!saved) return current.status === 'available' ? { status: 'conflict', record: current.record } : { status: 'unavailable' };
  try { storage.setItem(ANONYMOUS_DRAFT_KEY, JSON.stringify(data.data)); return { status: 'saved', record: saved }; } catch { return { status: 'unavailable' }; }
}

// prettier-ignore
export function removeAnonymousDraft(storage: RecoveryStorage | null, expected?: AnonymousDraftRecord, now = Date.now()): RemoveResult { if (!storage) return { status: 'unavailable' }; const current = readAnonymousDraft(storage, now); if (current.status !== 'available') return current; if (expected && !sameAnonymousDraftRecord(current.record, expected)) return { status: 'changed', record: current.record }; try { storage.removeItem(ANONYMOUS_DRAFT_KEY); return { status: 'removed' }; } catch { return { status: 'unavailable' }; } }
