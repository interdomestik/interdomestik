import { authorizeSessionTenant } from '@/lib/tenant-authority.server';
import { isStaffOrAdmin, ROLE_BRANCH_MANAGER } from '@/lib/roles.core';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getVerificationRequestsAction } from '../actions/verification';
import type { CashVerificationRequestDTO, VerificationView } from './verification.core';

export type VerificationPageData = Readonly<{
  view: VerificationView;
  query: string;
  leads: CashVerificationRequestDTO[];
  viewerRole: string;
}>;

/** Shared verification page gate: authorized viewer, parsed filters and the initial request list. */
export async function loadVerificationPageData(
  searchParams: Promise<{ view?: string; query?: string }>
): Promise<VerificationPageData> {
  // A session without a tenant fails closed to the same redirect as an absent session.
  const authorized = await authorizeSessionTenant(await headers()).catch(() => null);
  const session = authorized?.session;
  const params = await searchParams;

  const view: VerificationView = params.view === 'history' ? 'history' : 'queue';
  const query = params.query || '';

  if (
    !session ||
    !(isStaffOrAdmin(session.user.role) || session.user.role === ROLE_BRANCH_MANAGER)
  ) {
    redirect('/admin');
  }

  const result = await getVerificationRequestsAction({ view, query });
  const leads = (result?.success ? result.data : []) as CashVerificationRequestDTO[];
  return { view, query, leads, viewerRole: session.user.role };
}
