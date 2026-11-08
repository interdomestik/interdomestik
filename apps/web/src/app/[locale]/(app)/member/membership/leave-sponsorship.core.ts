'use server';

import { getSessionSafe } from '@/components/shell/session';
import { authorizeSessionUserTenant } from '@/lib/tenant-authority.server';
import { readTenantAuthority } from '@interdomestik/database/tenant-authority';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';
import {
  readSponsorOutlook,
  resolveEffectiveMembership,
  type SponsorOutlook,
} from '@interdomestik/domain-membership-billing/sponsor-coverage';
import { leaveSponsorship } from '@interdomestik/domain-membership-billing/sponsors/opt-out';
import { ROLES } from '@interdomestik/shared-auth';
import { revalidatePath } from 'next/cache';

export type LeaveSponsorshipResult =
  { ok: true } | { ok: false; error: 'not_found' | 'forbidden' | 'invalid_input' | 'error' };

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
    const session = await getSessionSafe('LeaveCompanyProgramme');
    if (!session || session.user.role !== ROLES.member) return { ok: false, error: 'forbidden' };
    const userId = session.user.id;
    const authority = await authorizeSessionUserTenant(userId);
    if (!authority) return { ok: false, error: 'forbidden' };
    const { tenantId, principal } = readTenantAuthority(authority);
    if (principal?.userId !== userId || principal.role !== ROLES.member)
      return { ok: false, error: 'forbidden' };
    const now = new Date();
    const memberships = await withTenantAuthority(authority, tx =>
      resolveEffectiveMembership(tx, tenantId, [userId], now)
    );
    const covering = memberships.get(userId);
    if (covering?.source !== 'sponsor' || covering.entryId !== input.entryId) {
      return { ok: false, error: 'not_found' };
    }
    const result = await leaveSponsorship(
      authority,
      { userId },
      { entryId: covering.entryId, now }
    );
    if (!result.ok)
      return { ok: false, error: result.error === 'not_found' ? 'not_found' : 'error' };
    revalidatePath('/[locale]/member/membership', 'page');
    return { ok: true };
  } catch {
    return { ok: false, error: 'error' };
  }
}

export type CompanyMembershipOutlookResult = { ok: true; outlook: SponsorOutlook } | { ok: false };

/** Read-only pricing check; identity and tenant always come from this request. */
export async function getCompanyMembershipOutlook(): Promise<CompanyMembershipOutlookResult> {
  try {
    const session = await getSessionSafe('CompanyMembershipOutlook');
    if (!session) return { ok: false };
    const authority = await authorizeSessionUserTenant(session.user.id);
    if (!authority) return { ok: false };
    const { tenantId } = readTenantAuthority(authority);
    const outlooks = await withTenantAuthority(authority, tx =>
      readSponsorOutlook(tx, tenantId, [session.user.id], new Date())
    );
    const outlook = outlooks.get(session.user.id);
    return outlook ? { ok: true, outlook } : { ok: false };
  } catch {
    return { ok: false };
  }
}
