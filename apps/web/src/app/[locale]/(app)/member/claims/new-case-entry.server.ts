import 'server-only';

import { evaluateNeutralOtpHost } from '@/app/api/auth/[...all]/neutral-otp-boundary';
import { authorizeSessionUserTenant } from '@/lib/tenant-authority.server';
import { resolveDefaultPublicTenantId } from '@/lib/tenant/tenant-hosts';
import { hasActiveMembership } from '@interdomestik/domain-membership-billing/subscription';
import { ensureTenantId } from '@interdomestik/shared-auth';
import { headers } from 'next/headers';

export type MemberNewCaseEntry = Readonly<{
  href: '/member/claims/new' | '/member/claims/new?mode=drafts' | '/member/membership';
  kind: 'case' | 'draft' | 'membership';
}>;

const CASE_ENTRY: MemberNewCaseEntry = { href: '/member/claims/new', kind: 'case' };

/**
 * Where "new case" leads from the member claims list. It mirrors the `/member/claims/new`
 * admission: members with access open a case, members who may keep a pre-membership draft open
 * the draft-only intake, and everyone else is sent to their membership instead of a dead end.
 */
export async function resolveMemberNewCaseEntry(
  session: Parameters<typeof ensureTenantId>[0] & {
    user: { id: string; role?: string | null };
  }
): Promise<MemberNewCaseEntry> {
  const { user } = session;
  try {
    const authority = await authorizeSessionUserTenant(user.id);
    if (authority && (await hasActiveMembership(user.id, authority))) return CASE_ENTRY;
    const canDraft =
      evaluateNeutralOtpHost(await headers()) &&
      (user.role === 'member' || user.role === 'user') &&
      ensureTenantId(session) === resolveDefaultPublicTenantId();
    return canDraft
      ? { href: '/member/claims/new?mode=drafts', kind: 'draft' }
      : { href: '/member/membership', kind: 'membership' };
  } catch {
    // The intake page re-checks access and shows its own gate.
    return CASE_ENTRY;
  }
}
