'use server';

import { createHash } from 'node:crypto';
import { resolveFreeStartDraftSession } from '@/actions/free-start-drafts/session.core';
import { enforceRateLimitForAction } from '@/lib/rate-limit';
import { runAuthenticatedAction } from '@/lib/safe-action';
// prettier-ignore
import { createClaimSchema, type CreateClaimValues } from '@interdomestik/domain-claims/validators/claims';
import { claims, db } from '@interdomestik/database';
import { isValidClaimNumber } from '@interdomestik/database/claim-number';
// prettier-ignore
import { resumeFreeStartDraft, type FreeStartDraft } from '@interdomestik/database/free-start-drafts';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { submitClaimCore } from './submit.core';

const inputSchema = z
  .object({ id: z.string().uuid(), expectedVersion: z.number().int().positive() })
  .strict();
const CATEGORY = { vehicle: 'Vehicle', property: 'Property' } as const;
// prettier-ignore
const ISSUE = { collision: 'Collision', theft: 'Theft', parking_damage: 'Parking damage', insurer_delay: 'Insurer delay', water_damage: 'Water damage', storm_fire: 'Storm or fire', burglary: 'Burglary', landlord_dispute: 'Landlord dispute' } as const;
// prettier-ignore
const OUTCOME = { repair: 'Repair', reimbursement: 'Reimbursement', compensation: 'Compensation', written_response: 'Written response' } as const;
const unavailable = () => ({ success: false as const, error: 'Claim submission unavailable.' });
export type SavedDraftClaimResult =
  ReturnType<typeof unavailable> | { success: true; claimId: string; claimNumber: string };

function deterministicClaimId(tenantId: string, actorId: string, draftId: string) {
  const digest = createHash('sha256')
    .update(JSON.stringify([tenantId, actorId, draftId]))
    .digest('hex');
  return `fsd_${digest}`;
}

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

type ExactClaim =
  { kind: 'absent' | 'invalid' } | { kind: 'found'; claimId: string; claimNumber: string };

async function readExactClaim(
  claimId: string,
  tenantId: string,
  actorId: string
): Promise<ExactClaim> {
  // db-access-guard: tenant-scoped -- reason: RLS enabled, not enforced for this runtime role; exact-id, tenant and owner predicates are mandatory.
  const [row] = await db
    .select({ id: claims.id, claimNumber: claims.claimNumber })
    .from(claims)
    .where(and(eq(claims.id, claimId), eq(claims.tenantId, tenantId), eq(claims.userId, actorId)))
    .limit(1);
  if (!row) return { kind: 'absent' };
  if (typeof row.claimNumber !== 'string' || !isValidClaimNumber(row.claimNumber)) {
    return { kind: 'invalid' };
  }
  return { kind: 'found', claimId, claimNumber: row.claimNumber };
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
    const claimId = deterministicClaimId(tenantId, actorId, resumed.draft.id);
    const existing = await readExactClaim(claimId, tenantId, actorId);
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
    const recovered = await readExactClaim(claimId, tenantId, actorId);
    return recovered.kind === 'found'
      ? { success: true as const, claimId: recovered.claimId, claimNumber: recovered.claimNumber }
      : unavailable();
  }) as Promise<SavedDraftClaimResult>;
}
