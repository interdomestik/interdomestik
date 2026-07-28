import { freeStartDraftPayloadSchema } from '@/lib/validators/free-start-draft';
import { z } from 'zod';

import type { CategoryId, DraftState, StepId } from './types';

export const ANONYMOUS_DRAFT_KEY = 'interdomestik_free_start_recovery_v1';
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
export type ReadResult = { status: 'available'; record: AnonymousDraftRecord } | { status: 'none' } | { status: 'unavailable' };
export type WriteResult =
  | { status: 'saved'; record: AnonymousDraftRecord }
  | { status: 'conflict'; record: AnonymousDraftRecord }
  | { status: 'stale' }
  | { status: 'unavailable' };
export type RemoveResult =
  | { status: 'changed'; record: AnonymousDraftRecord }
  | { status: 'none' | 'removed' | 'unavailable' };

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
    if (!input || typeof input !== 'object') return null;
    const draft = (input as { draft?: unknown }).draft;
    if (!draft || typeof draft !== 'object') return null;
    if (!Object.prototype.hasOwnProperty.call(draft, 'resumeStep')) return null;
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
    ) {
      return null;
    }
    const value = snapshotFromPayload(parsed.data.draft);
    return {
      ...value,
      updatedAt: parsed.data.updatedAt,
      expiresAt: parsed.data.expiresAt,
    };
  } catch {
    return null;
  }
}

export function readAnonymousDraft(storage: RecoveryStorage | null, now = Date.now()): ReadResult {
  if (!storage) return { status: 'unavailable' };
  try {
    const raw = storage.getItem(ANONYMOUS_DRAFT_KEY);
    if (!raw) return { status: 'none' };
    const record = decode(raw, now);
    if (record) return { status: 'available', record };
    storage.removeItem(ANONYMOUS_DRAFT_KEY);
    return { status: 'none' };
  } catch {
    return { status: 'unavailable' };
  }
}

// prettier-ignore
export function writeAnonymousDraft(storage: RecoveryStorage | null, snapshot: AnonymousDraftSnapshot, expected: AnonymousDraftRecord | null, now = Date.now()): WriteResult {
  if (!storage) return { status: 'unavailable' };
  const current = readAnonymousDraft(storage, now);
  if (current.status === 'unavailable') return { status: 'unavailable' };
  if (current.status === 'none' && expected) return { status: 'stale' };
  // prettier-ignore
  if (current.status === 'available' && (!expected || !sameAnonymousDraftRecord(current.record, expected))) {
    return { status: 'conflict', record: current.record };
  }
  // prettier-ignore
  const canonical = createAnonymousDraftSnapshot(snapshot.category, snapshot.draft, snapshot.resumeStep);
  if (!canonical) return { status: 'unavailable' };
  const revisionNow =
    current.status === 'available' ? Math.max(now, Date.parse(current.record.updatedAt) + 1) : now;
  const record = {
    version: 1,
    draft: {
      category: canonical.category,
      counterparty: canonical.draft.counterparty || undefined,
      desiredOutcome: canonical.draft.desiredOutcome || undefined,
      incidentDate: canonical.draft.incidentDate || undefined,
      issueType: canonical.draft.issueType || undefined,
      resumeStep: canonical.resumeStep,
      summary: canonical.draft.summary || undefined,
    },
    updatedAt: new Date(revisionNow).toISOString(),
    expiresAt: new Date(revisionNow + ANONYMOUS_DRAFT_TTL_MS).toISOString(),
  } as const;
  const validated = storedRecordSchema.safeParse(record);
  if (!validated.success) return { status: 'unavailable' };
  const saved = decode(JSON.stringify(validated.data), revisionNow);
  if (!saved) return { status: 'unavailable' };
  try {
    storage.setItem(ANONYMOUS_DRAFT_KEY, JSON.stringify(validated.data));
    return { status: 'saved', record: saved };
  } catch {
    return { status: 'unavailable' };
  }
}

// prettier-ignore
export function removeAnonymousDraft(storage: RecoveryStorage | null, expected?: AnonymousDraftRecord, now = Date.now()): RemoveResult {
  if (!storage) return { status: 'unavailable' };
  const current = readAnonymousDraft(storage, now);
  if (current.status !== 'available') return current;
  if (expected && !sameAnonymousDraftRecord(current.record, expected)) {
    return { status: 'changed', record: current.record };
  }
  try {
    storage.removeItem(ANONYMOUS_DRAFT_KEY);
    return { status: 'removed' };
  } catch {
    return { status: 'unavailable' };
  }
}
