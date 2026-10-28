import type { CrmActorContext } from '@interdomestik/domain-crm/context';

import {
  BranchManagerCrmReportingAccessDeniedError,
  getBranchManagerCrmReportingCore as readBranchManagerDashboard,
  type BranchManagerCrmReportingDashboard,
} from './_branch-manager-core';
import { createAdminCrmReportingTenantRepositories } from './_reporting-tenant';

export type BranchManagerCrmReportingTenantOptions = {
  branchLabel?: string | null;
  logger?: Pick<Console, 'error'>;
  now?: () => string;
};

export async function getBranchManagerCrmReportingCore(
  args: { actor: CrmActorContext },
  options: BranchManagerCrmReportingTenantOptions = {}
): Promise<BranchManagerCrmReportingDashboard> {
  const tenantId = args.actor.tenantId?.trim();
  if (!tenantId) throw new BranchManagerCrmReportingAccessDeniedError('tenant_scope');
  // Creating the interfaces does not acquire a connection. The unchanged core enforces
  // role and branch authorization before any read; each read owns its transaction.
  const repositories = createAdminCrmReportingTenantRepositories(tenantId);
  return readBranchManagerDashboard(args, {
    branchLabel: options.branchLabel,
    logger: options.logger,
    now: options.now,
    reportingRepository: repositories.reportingRepository,
    forecastSnapshotRepository: repositories.forecastSnapshotRepository,
  });
}
