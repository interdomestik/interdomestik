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
  | { status: 'saved'; updatedAt: string }
  | { status: 'conflict'; record: AnonymousDraftRecord }
  | { status: 'stale' }
  | { status: 'unavailable' };
export type RemoveResult =
  | { status: 'changed'; record: AnonymousDraftRecord }
  | { status: 'none' | 'removed' | 'unavailable' };

// prettier-ignore
export function getAnonymousDraftStorage(): RecoveryStorage | null { try { return globalThis.localStorage; } catch { return null; } }

// prettier-ignore
export function createAnonymousDraftSnapshot(category: CategoryId, draft: DraftState, step: StepId): AnonymousDraftSnapshot | null { if (category !== 'vehicle' && category !== 'property') return null; return { category, draft, resumeStep: step === 'complete' ? 'preview' : step }; }

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
    const value = parsed.data.draft;
    return {
      category: value.category,
      draft: {
        counterparty: value.counterparty ?? '',
        desiredOutcome: value.desiredOutcome ?? '',
        incidentDate: value.incidentDate ?? '',
        issueType: value.issueType ?? '',
        summary: value.summary ?? '',
      },
      resumeStep: value.resumeStep,
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

export function writeAnonymousDraft(
  storage: RecoveryStorage | null,
  snapshot: AnonymousDraftSnapshot,
  expectedUpdatedAt: string | null,
  now = Date.now()
): WriteResult {
  if (!storage) return { status: 'unavailable' };
  const current = readAnonymousDraft(storage, now);
  if (current.status === 'unavailable') return { status: 'unavailable' };
  if (current.status === 'none' && expectedUpdatedAt) return { status: 'stale' };
  if (current.status === 'available' && current.record.updatedAt !== expectedUpdatedAt) {
    return { status: 'conflict', record: current.record };
  }
  const updatedAt = new Date(now).toISOString();
  const record = {
    version: 1,
    draft: {
      category: snapshot.category,
      counterparty: snapshot.draft.counterparty || undefined,
      desiredOutcome: snapshot.draft.desiredOutcome || undefined,
      incidentDate: snapshot.draft.incidentDate || undefined,
      issueType: snapshot.draft.issueType || undefined,
      resumeStep: snapshot.resumeStep,
      summary: snapshot.draft.summary || undefined,
    },
    updatedAt,
    expiresAt: new Date(now + ANONYMOUS_DRAFT_TTL_MS).toISOString(),
  } as const;
  const validated = storedRecordSchema.safeParse(record);
  if (!validated.success) return { status: 'unavailable' };
  try {
    storage.setItem(ANONYMOUS_DRAFT_KEY, JSON.stringify(validated.data));
    return { status: 'saved', updatedAt };
  } catch {
    return { status: 'unavailable' };
  }
}

// prettier-ignore
export function removeAnonymousDraft(storage: RecoveryStorage | null, expected?: AnonymousDraftRecord, now = Date.now()): RemoveResult {
  if (!storage) return { status: 'unavailable' };
  const current = readAnonymousDraft(storage, now);
  if (current.status !== 'available') return current;
  if (expected && JSON.stringify(current.record) !== JSON.stringify(expected)) {
    return { status: 'changed', record: current.record };
  }
  try {
    storage.removeItem(ANONYMOUS_DRAFT_KEY);
    return { status: 'removed' };
  } catch {
    return { status: 'unavailable' };
  }
}
