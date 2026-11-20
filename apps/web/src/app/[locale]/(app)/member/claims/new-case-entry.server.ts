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
const DRAFT_ENTRY: MemberNewCaseEntry = { href: '/member/claims/new?mode=drafts', kind: 'draft' };
const MEMBERSHIP_ENTRY: MemberNewCaseEntry = { href: '/member/membership', kind: 'membership' };

type EntrySession = Parameters<typeof ensureTenantId>[0] & {
  user: { id: string; role?: string | null };
};

/** Mirrors the draft-only admission of `/member/claims/new?mode=drafts`; unknown means no. */
async function canKeepPreMembershipDraft(session: EntrySession): Promise<boolean> {
  try {
    return (
      evaluateNeutralOtpHost(await headers()) &&
      (session.user.role === 'member' || session.user.role === 'user') &&
      ensureTenantId(session) === resolveDefaultPublicTenantId()
    );
  } catch {
    return false;
  }
}

/**
 * Where "new case" leads from the member claims list. It mirrors the `/member/claims/new`
 * admission: members with access open a case, members who may keep a pre-membership draft open
 * the draft-only intake, and everyone else is sent to their membership instead of a dead end.
 */
export async function resolveMemberNewCaseEntry(
  session: EntrySession
): Promise<MemberNewCaseEntry> {
  const canDraft = await canKeepPreMembershipDraft(session);
  try {
    const authority = await authorizeSessionUserTenant(session.user.id);
    if (authority && (await hasActiveMembership(session.user.id, authority))) return CASE_ENTRY;
  } catch {
    // The intake page re-checks access; a draft-eligible member keeps the door that admits them
    // with or without membership.
    return canDraft ? DRAFT_ENTRY : CASE_ENTRY;
  }
  return canDraft ? DRAFT_ENTRY : MEMBERSHIP_ENTRY;
}
