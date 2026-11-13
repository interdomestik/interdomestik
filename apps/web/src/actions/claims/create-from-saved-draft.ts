'use server';

import { resolveFreeStartDraftSession } from '@/actions/free-start-drafts/session.core';
import { ACTION_LOCALES, resolveActionLocale, type AppLocale } from '@/lib/i18n/action-locale';
import { enforceRateLimitForAction } from '@/lib/rate-limit';
import { runAuthenticatedAction } from '@/lib/safe-action';
// prettier-ignore
import { createClaimSchema, type CreateClaimValues } from '@interdomestik/domain-claims/validators/claims';
// prettier-ignore
import { resumeFreeStartDraft, type FreeStartDraft } from '@interdomestik/database/free-start-drafts';
import { z } from 'zod';
import { readSavedDraftClaim, savedDraftClaimId } from './saved-draft-claim-identity';
import { buildSavedDraftClaimText } from './saved-draft-claim-text';
import { submitClaimCore } from './submit.core';

const diasporaCountrySchema = z.enum(['DE', 'CH', 'AT', 'IT']);
// prettier-ignore
const claimStartSchema = z.object({ confirmed: z.literal(true), handoffContext: z.object({ source: z.literal('diaspora-green-card'), country: diasporaCountrySchema, incidentLocation: z.literal('abroad') }).strict(), incidentCountryCode: diasporaCountrySchema }).strict().refine(value => value.incidentCountryCode === value.handoffContext.country);
// prettier-ignore
const inputSchema = z.object({ id: z.string().uuid(), expectedVersion: z.number().int().positive(), claimStart: claimStartSchema.optional(), locale: z.enum(ACTION_LOCALES).optional() }).strict();
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

// prettier-ignore
async function mapDraft(draft: FreeStartDraft, locale: AppLocale, incidentCountryCode?: z.infer<typeof diasporaCountrySchema>): Promise<CreateClaimValues | null> {
  const category = ownValue(CATEGORY, draft.category);
  const issue = ownValue(ISSUE, draft.issueType);
  const outcome = ownValue(OUTCOME, draft.desiredOutcome);
  const counterparty = draft.counterparty.trim();
  const summary = draft.summary.trim();
  if (!category || !issue || !outcome || counterparty.length < 2 || !summary) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.incidentDate)) return null;
  const text = await buildSavedDraftClaimText(
    { category: draft.category, issueType: draft.issueType, incidentDate: draft.incidentDate, counterparty, desiredOutcome: draft.desiredOutcome, summary },
    { category, issue, outcome },
    locale
  );
  const data = {
    category: draft.category,
    companyName: counterparty,
    currency: 'EUR',
    description: text.description,
    files: [],
    incidentDate: draft.incidentDate,
    ...(incidentCountryCode ? { incidentCountryCode } : {}),
    title: text.title,
  };
  const parsed = createClaimSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}
export async function lookupSavedDraftClaim(input: unknown): Promise<SavedDraftClaimLookup> {
  const parsed = lookupSchema.safeParse(input);
  if (!parsed.success) return noClaim();
  try {
    const result = await runAuthenticatedAction(
      async ({ session, authority, tenantId, requestHeaders }) => {
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
        const claim = await readSavedDraftClaim(claimId, authority, actorId);
        return claim.kind === 'found'
          ? { claim: { id: claim.claimId, number: claim.claimNumber } }
          : noClaim();
      }
    );
    return result.success && result.data ? result.data : noClaim();
  } catch (error) {
    const redirect = error as { digest?: unknown; message?: unknown };
    if (redirect.message === 'NEXT_REDIRECT' || String(redirect.digest).startsWith('NEXT_REDIRECT'))
      throw error;
    return noClaim();
  }
}

export async function createClaimFromSavedDraft(input: unknown): Promise<SavedDraftClaimResult> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return unavailable();
  return runAuthenticatedAction(async ({ session, authority, tenantId, requestHeaders }) => {
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
    const existing = await readSavedDraftClaim(claimId, authority, actorId);
    // prettier-ignore
    if (existing.kind === 'found') return { success: true as const, claimId: existing.claimId, claimNumber: existing.claimNumber };
    // prettier-ignore
    if (existing.kind === 'invalid' || resumed.draft.version !== parsed.data.expectedVersion || resumed.draft.resumeStep !== 'preview') return unavailable();
    const claimStart = resumed.draft.category === 'vehicle' ? parsed.data.claimStart : undefined;
    const locale = resolveActionLocale(parsed.data.locale, requestHeaders);
    const data = await mapDraft(resumed.draft, locale, claimStart?.incidentCountryCode);
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
    } catch {
      // Ambiguous writer outcomes use the same bounded exact recovery below.
    }
    const recovered = await readSavedDraftClaim(claimId, authority, actorId);
    return recovered.kind === 'found'
      ? { success: true as const, claimId: recovered.claimId, claimNumber: recovered.claimNumber }
      : unavailable();
  }) as Promise<SavedDraftClaimResult>;
}
