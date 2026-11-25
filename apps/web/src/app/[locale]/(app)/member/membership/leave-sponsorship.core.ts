'use server';

import { readTenantAuthority } from '@interdomestik/database/tenant-authority';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';
import {
  readSponsorOutlook,
  type SponsorOutlook,
} from '@interdomestik/domain-membership-billing/sponsor-coverage';
import {
  leaveSponsorship,
  listLeavableSponsorEntries,
} from '@interdomestik/domain-membership-billing/sponsors/opt-out';
import { ROLES } from '@interdomestik/shared-auth';
import { revalidatePath } from 'next/cache';
import { requireAdmittedMember } from '@/lib/privacy/require-member-acceptance';

export type LeaveSponsorshipResult =
  | { ok: true }
  | {
      ok: false;
      error: 'not_found' | 'forbidden' | 'invalid_input' | 'error' | 'acceptance_required';
    };

export async function leaveCompanyProgramme(input: unknown): Promise<LeaveSponsorshipResult> {
  if (
    !input ||
    typeof input !== 'object' ||
    !('entryId' in input) ||
    typeof input.entryId !== 'string' ||
    input.entryId.length < 1 ||
    input.entryId.length > 200 ||
    input.entryId.trim() !== input.entryId ||
    Object.keys(input).some(key => key !== 'entryId')
  )
    return { ok: false, error: 'invalid_input' };
  try {
    const admission = await requireAdmittedMember();
    if (!admission.ok) {
      return {
        ok: false,
        error:
          admission.failure.code === 'acceptance_required' ? 'acceptance_required' : 'forbidden',
      };
    }
    const { session, authority } = admission.authorized;
    if (session.user.role !== ROLES.member) return { ok: false, error: 'forbidden' };
    const userId = session.user.id;
    const { tenantId, principal } = readTenantAuthority(authority);
    if (principal?.userId !== userId || principal.role !== ROLES.member)
      return { ok: false, error: 'forbidden' };
    const now = new Date();
    // Current coverage, a pending handover or a future start: the member's own live entries.
    const leavable = await withTenantAuthority(authority, tx =>
      listLeavableSponsorEntries(tx, tenantId, userId, now)
    );
    const entryId = leavable.find(id => id === input.entryId);
    if (!entryId) return { ok: false, error: 'not_found' };
    const result = await leaveSponsorship(authority, { userId }, { entryId, now });
    if (!result.ok)
      return { ok: false, error: result.error === 'not_found' ? 'not_found' : 'error' };
    revalidatePath('/[locale]/member/membership', 'page');
    return { ok: true };
  } catch (error) {
    console.error('Company membership request failed', error);
    return { ok: false, error: 'error' };
  }
}

export type CompanyMembershipOutlookResult =
  { ok: true; outlook: SponsorOutlook } | { ok: false; code?: string };

/** Read-only pricing check; identity and tenant always come from this request. */
export async function getCompanyMembershipOutlook(): Promise<CompanyMembershipOutlookResult> {
  try {
    const admission = await requireAdmittedMember();
    if (!admission.ok) return { ok: false, code: admission.failure.code };
    const { session, authority } = admission.authorized;
    const { tenantId } = readTenantAuthority(authority);
    const outlooks = await withTenantAuthority(authority, tx =>
      readSponsorOutlook(tx, tenantId, [session.user.id], new Date())
    );
    const outlook = outlooks.get(session.user.id);
    return outlook ? { ok: true, outlook } : { ok: false };
  } catch (error) {
    console.error('Company membership request failed', error);
    return { ok: false };
  }
}
