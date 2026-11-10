import { requireSessionOrRedirect } from '@/components/shell/session';
import { deniesClaimMessageContent } from '@/lib/branch-manager-message-boundary';
import { authorizeSessionTenant } from '@/lib/tenant-authority.server';
import { readTenantAuthority } from '@interdomestik/database/tenant-authority';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import StaffSupportHandoffsCoreEntry from './_core.entry';
import { BranchManagerHandoffs } from '@/features/claims/support-handoffs/branch-manager-handoffs';

export { generateMetadata, generateViewport } from './_core.entry';

type Props = Readonly<Parameters<typeof StaffSupportHandoffsCoreEntry>[0]>;

function handleMissingTenant(error: unknown): never {
  if ((error as { name?: unknown } | null)?.name !== 'MissingTenantError') throw error;
  return notFound();
}

export default async function SupportHandoffsPage(props: Props) {
  const authorized = await authorizeSessionTenant().catch(handleMissingTenant);
  const { locale } = await props.params;
  requireSessionOrRedirect(authorized?.session, locale);
  if (!authorized) return notFound();
  const { principal, tenantId } = readTenantAuthority(authorized.authority);
  if (!principal?.userId) return notFound();
  if (deniesClaimMessageContent(principal.role)) {
    return <BranchManagerHandoffs {...props} authority={authorized.authority} />;
  }
  const view = await StaffSupportHandoffsCoreEntry(props);
  // Explicit headers bypass the RSC session cache to recheck revocation and role changes.
  const reauthorized = await authorizeSessionTenant(await headers()).catch(handleMissingTenant);
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
