import { requireSessionOrRedirect } from '@/components/shell/session';
import { deniesClaimMessageContent } from '@/lib/branch-manager-message-boundary';
import { authorizeSessionTenant } from '@/lib/tenant-authority.server';
import { readTenantAuthority } from '@interdomestik/database/tenant-authority';
import { notFound } from 'next/navigation';
import StaffSupportHandoffsCoreEntry from './_core.entry';
import { BranchManagerHandoffs } from '@/features/claims/support-handoffs/branch-manager-handoffs';

export { generateMetadata, generateViewport } from './_core.entry';

type Props = Readonly<Parameters<typeof StaffSupportHandoffsCoreEntry>[0]>;

export default async function SupportHandoffsPage(props: Props) {
  const authorized = await authorizeSessionTenant();
  const { locale } = await props.params;
  requireSessionOrRedirect(authorized?.session, locale);
  if (!authorized) return notFound();
  const { principal, tenantId } = readTenantAuthority(authorized.authority);
  if (!principal?.userId) return notFound();
  if (deniesClaimMessageContent(principal.role)) {
    return <BranchManagerHandoffs {...props} authority={authorized.authority} />;
  }
  const view = await StaffSupportHandoffsCoreEntry(props);
  // Release content only when both fresh reads permit it, even if the core's shell role is cached.
  const reauthorized = await authorizeSessionTenant();
  if (!reauthorized) return notFound();
  const current = readTenantAuthority(reauthorized.authority);
  if (current.principal?.userId !== principal.userId || current.tenantId !== tenantId) {
    return notFound();
  }
  if (deniesClaimMessageContent(current.principal.role)) {
    return <BranchManagerHandoffs {...props} authority={reauthorized.authority} />;
  }
  return view;
}
