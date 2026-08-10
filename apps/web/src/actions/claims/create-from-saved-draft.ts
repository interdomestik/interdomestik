'use server';

import { resolveFreeStartDraftSession } from '@/actions/free-start-drafts/session.core';
import { enforceRateLimitForAction } from '@/lib/rate-limit';
import { runAuthenticatedAction } from '@/lib/safe-action';
// prettier-ignore
import { createClaimSchema, type CreateClaimValues } from '@interdomestik/domain-claims/validators/claims';
// prettier-ignore
import { resumeFreeStartDraft, type FreeStartDraft } from '@interdomestik/database/free-start-drafts';
import { z } from 'zod';
import { readSavedDraftClaim, savedDraftClaimId } from './saved-draft-claim-identity';
import { submitClaimCore } from './submit.core';

const inputSchema = z
  .object({ id: z.string().uuid(), expectedVersion: z.number().int().positive() })
  .strict();
const lookupSchema = z.object({ id: z.string().uuid() }).strict();
const CATEGORY = { vehicle: 'Vehicle', property: 'Property' } as const;
// prettier-ignore
const ISSUE = { collision: 'Collision', theft: 'Theft', parking_damage: 'Parking damage', insurer_delay: 'Insurer delay', water_damage: 'Water damage', storm_fire: 'Storm or fire', burglary: 'Burglary', landlord_dispute: 'Landlord dispute' } as const;
// prettier-ignore
const OUTCOME = { repair: 'Repair', reimbursement: 'Reimbursement', compensation: 'Compensation', written_response: 'Written response' } as const;
const unavailable = () => ({ success: false as const, error: 'Claim submission unavailable.' });
export type SavedDraftClaimResult =
  ReturnType<typeof unavailable> | { success: true; claimId: string; claimNumber: string };
export type SavedDraftClaimLookup = { claim: { id: string; number: string } | null };
const noClaim = (): SavedDraftClaimLookup => ({ claim: null });

function ownValue(record: Readonly<Record<string, string>>, key: string | null) {
  return key && Object.hasOwn(record, key) ? record[key] : null;
}

function mapDraft(draft: FreeStartDraft): CreateClaimValues | null {
  const category = ownValue(CATEGORY, draft.category);
  const issue = ownValue(ISSUE, draft.issueType);
  const outcome = ownValue(OUTCOME, draft.desiredOutcome);
  const counterparty = draft.counterparty.trim();
  const summary = draft.summary.trim();
  if (!category || !issue || !outcome || counterparty.length < 2 || !summary) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.incidentDate)) return null;
  const data = {
    category: draft.category,
    companyName: counterparty,
    currency: 'EUR',
    description: [
      `Category: ${category}`,
      `Issue: ${issue}`,
      `Incident date: ${draft.incidentDate}`,
      `Counterparty: ${counterparty}`,
      `Desired outcome: ${outcome}`,
      `Summary: ${summary}`,
    ].join('\n'),
    files: [],
    incidentDate: draft.incidentDate,
    title: `${category}: ${issue}`,
  };
  const parsed = createClaimSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}

export async function lookupSavedDraftClaim(input: unknown): Promise<SavedDraftClaimLookup> {
  const parsed = lookupSchema.safeParse(input);
  if (!parsed.success) return noClaim();
  try {
    const result = await runAuthenticatedAction(async ({ session, tenantId, requestHeaders }) => {
      const actorId = session.user.id;
      const fresh = await resolveFreeStartDraftSession(requestHeaders);
      if (
        !fresh.ok ||
        session.user.tenantId !== tenantId ||
        fresh.context.ownerUserId !== actorId ||
        fresh.context.tenantId !== tenantId ||
        fresh.context.accessTenantId !== tenantId
      )
        return noClaim();
      const claimId = savedDraftClaimId(tenantId, actorId, parsed.data.id);
      const claim = await readSavedDraftClaim(claimId, tenantId, actorId);
      return claim.kind === 'found'
        ? { claim: { id: claim.claimId, number: claim.claimNumber } }
        : noClaim();
    });
    return result.success && result.data ? result.data : noClaim();
  } catch {
    return noClaim();
  }
}

export async function createClaimFromSavedDraft(input: unknown): Promise<SavedDraftClaimResult> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return unavailable();
  return runAuthenticatedAction(async ({ session, tenantId, requestHeaders }) => {
    const actorId = session.user.id;
    const fresh = await resolveFreeStartDraftSession(requestHeaders);
    if (
      !fresh.ok ||
      session.user.tenantId !== tenantId ||
      fresh.context.ownerUserId !== actorId ||
      fresh.context.tenantId !== tenantId ||
      fresh.context.accessTenantId !== tenantId
    )
      return unavailable();
    const resumed = await resumeFreeStartDraft(fresh.context, parsed.data.id);
    if (!resumed.ok) return unavailable();
    const claimId = savedDraftClaimId(tenantId, actorId, resumed.draft.id);
    const existing = await readSavedDraftClaim(claimId, tenantId, actorId);
    if (existing.kind === 'found') {
      return {
        success: true as const,
        claimId: existing.claimId,
        claimNumber: existing.claimNumber,
      };
    }
    if (
      existing.kind === 'invalid' ||
      resumed.draft.version !== parsed.data.expectedVersion ||
      resumed.draft.resumeStep !== 'preview'
    ) {
      return unavailable();
    }
    const data = mapDraft(resumed.draft);
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
        data,
        idempotencyKey: `ida-ui03a2-b1:${resumed.draft.id}`,
        requestHeaders,
        session,
        trustedClaimId: claimId,
      });
      if (result.success && result.claimId === claimId)
        return { success: true as const, claimId, claimNumber: result.claimNumber };
    } catch {
      // Ambiguous writer outcomes use the same bounded exact recovery below.
    }
    const recovered = await readSavedDraftClaim(claimId, tenantId, actorId);
    return recovered.kind === 'found'
      ? { success: true as const, claimId: recovered.claimId, claimNumber: recovered.claimNumber }
      : unavailable();
  }) as Promise<SavedDraftClaimResult>;
}
