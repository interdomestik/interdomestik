import { requireSessionOrRedirect } from '@/components/shell/session';
import { deniesClaimMessageContent } from '@/lib/branch-manager-message-boundary';
import { authorizeSessionTenant } from '@/lib/tenant-authority.server';
import { readTenantAuthority } from '@interdomestik/database/tenant-authority';
import { notFound } from 'next/navigation';
import StaffHandoffContent, { type HandoffContentProps } from './staff-handoff-content';
import { BranchManagerHandoffs } from '@/features/claims/support-handoffs/branch-manager-handoffs';

export { generateMetadata, generateViewport } from '@/app/_segment-exports';

type Props = Omit<HandoffContentProps, 'authority'>;

export default async function SupportHandoffsPage(props: Props) {
  const authorized = await authorizeSessionTenant();
  const { locale } = await props.params;
  requireSessionOrRedirect(authorized?.session, locale);
  if (!authorized) return notFound();
  // Both paths are selected by the reader's authenticated authority, never the shell's TTL cache.
  const { principal } = readTenantAuthority(authorized.authority);
  if (!principal?.userId) return notFound();
  if (deniesClaimMessageContent(principal.role)) {
    return <BranchManagerHandoffs {...props} authority={authorized.authority} />;
  }
  return StaffHandoffContent({ ...props, authority: authorized.authority });
}
