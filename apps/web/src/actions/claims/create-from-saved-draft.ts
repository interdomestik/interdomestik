'use server';

import { resolveFreeStartDraftSession } from '@/actions/free-start-drafts/session.core';
import { runAdmittedAction } from '@/lib/privacy/require-member-acceptance';
import { enforceRateLimitForAction } from '@/lib/rate-limit';
import { classifyThrown } from '@/lib/safe-action.classify';
import { isRefusalCode } from '@/lib/safe-action.types';
import { headers } from 'next/headers';
import { unstable_rethrow } from 'next/navigation';
// prettier-ignore
import { resumeFreeStartDraft } from '@interdomestik/database/free-start-drafts';
import { z } from 'zod';
import {
  matchesSavedDraftOwner,
  readSavedDraftClaim,
  savedDraftClaimId,
} from './saved-draft-claim-identity';
import { mapDraft } from './saved-draft-claim-mapping';
import { submitClaimCore } from './submit.core';

const diasporaCountrySchema = z.enum(['DE', 'CH', 'AT', 'IT']);
// prettier-ignore
const claimStartSchema = z.object({ confirmed: z.literal(true), handoffContext: z.object({ source: z.literal('diaspora-green-card'), country: diasporaCountrySchema, incidentLocation: z.literal('abroad') }).strict(), incidentCountryCode: diasporaCountrySchema }).strict().refine(value => value.incidentCountryCode === value.handoffContext.country);
// prettier-ignore
const inputSchema = z.object({ id: z.string().uuid(), expectedVersion: z.number().int().positive(), claimStart: claimStartSchema.optional() }).strict();
const lookupSchema = z.object({ id: z.string().uuid() }).strict();
const unavailable = () => ({ success: false as const, error: 'Claim submission unavailable.' });
export type SavedDraftClaimResult =
  ReturnType<typeof unavailable> | { success: true; claimId: string; claimNumber: string };
export type SavedDraftClaimLookup =
  { claim: { id: string; number: string } | null } | { code: 'unavailable' };
const lookupUnavailable = { code: 'unavailable' } as const;
const noClaim = () => ({ claim: null });
export async function lookupSavedDraftClaim(input: unknown): Promise<SavedDraftClaimLookup> {
  const parsed = lookupSchema.safeParse(input);
  if (!parsed.success) return noClaim();
  try {
    const fresh = await resolveFreeStartDraftSession(await headers());
    if (!fresh.ok) return fresh.code === 'unavailable' ? lookupUnavailable : noClaim();
    if (!matchesSavedDraftOwner(fresh)) return noClaim();
    const { tenantId, ownerUserId } = fresh.context;
    const claimId = savedDraftClaimId(tenantId, ownerUserId, parsed.data.id);
    const result = await runAdmittedAction(fresh.authorized, () =>
      readSavedDraftClaim(claimId, fresh.authorized.authority, ownerUserId)
    );
    if (!result.success) return isRefusalCode(result.code) ? noClaim() : lookupUnavailable;
    const claim = result.data;
    return claim?.kind === 'found'
      ? { claim: { id: claim.claimId, number: claim.claimNumber } }
      : noClaim();
  } catch (error) {
    unstable_rethrow(error);
    return lookupUnavailable;
  }
}

export async function createClaimFromSavedDraft(input: unknown): Promise<SavedDraftClaimResult> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return unavailable();
  try {
    const requestHeaders = await headers();
    const fresh = await resolveFreeStartDraftSession(requestHeaders);
    if (!fresh.ok || !matchesSavedDraftOwner(fresh)) return unavailable();
    const result = await runAdmittedAction(fresh.authorized, () =>
      submitSavedDraft(fresh, parsed.data, requestHeaders)
    );
    return result.success && result.data ? result.data : unavailable();
  } catch (error) {
    unstable_rethrow(error);
    return unavailable();
  }
}

async function submitSavedDraft(
  fresh: Extract<Awaited<ReturnType<typeof resolveFreeStartDraftSession>>, { ok: true }>,
  input: z.infer<typeof inputSchema>,
  requestHeaders: Headers
): Promise<SavedDraftClaimResult> {
  const { session, authority } = fresh.authorized;
  const { tenantId, ownerUserId: actorId } = fresh.context;
  const resumed = await resumeFreeStartDraft(fresh.context, input.id);
  if (!resumed.ok) return unavailable();
  const claimId = savedDraftClaimId(tenantId, actorId, resumed.draft.id);
  const existing = await readSavedDraftClaim(claimId, authority, actorId);
  // prettier-ignore
  if (existing.kind === 'found') return { success: true as const, claimId: existing.claimId, claimNumber: existing.claimNumber };
  // prettier-ignore
  if (existing.kind === 'invalid' || resumed.draft.version !== input.expectedVersion || resumed.draft.resumeStep !== 'preview') return unavailable();
  const claimStart = resumed.draft.category === 'vehicle' ? input.claimStart : undefined;
  const data = await mapDraft(resumed.draft, claimStart?.incidentCountryCode);
  if (!data) return unavailable();
  const limit = await enforceRateLimitForAction({
    name: 'action:submit-claim',
    limit: 5,
    windowSeconds: 600,
    headers: requestHeaders,
    productionSensitive: true,
  });
  if (limit.limited) return unavailable();
  try {
    const result = await submitClaimCore({
      authority,
      data,
      handoffContext: claimStart?.handoffContext,
      idempotencyKey: `ida-ui03a2-b1:${resumed.draft.id}`,
      requestHeaders,
      session,
      trustedClaimId: claimId,
    });
    if (result.success && result.claimId === claimId)
      return { success: true as const, claimId, claimNumber: result.claimNumber };
    if (!result.success && isRefusalCode(result.code)) {
      throw Object.assign(new Error(result.error), { code: result.code });
    }
  } catch (error) {
    if (classifyThrown(error, 'legacy').kind === 'refusal') throw error;
    // Ambiguous writer outcomes use the same bounded exact recovery below.
  }
  const recovered = await readSavedDraftClaim(claimId, authority, actorId);
  return recovered.kind === 'found'
    ? { success: true as const, claimId: recovered.claimId, claimNumber: recovered.claimNumber }
    : unavailable();
}
