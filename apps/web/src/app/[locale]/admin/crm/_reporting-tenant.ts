import { withTenantContext, type TenantTransaction } from '@interdomestik/database';
import type { CrmActorContext } from '@interdomestik/domain-crm/context';
import type {
  CrmForecastSnapshotRepository,
  CrmReportingRepository,
} from '@interdomestik/domain-crm/reporting/repository';

import {
  createCrmForecastSnapshotObservabilityRepository,
  type CrmForecastSnapshotObservabilityRepository,
} from '@/adapters/crm/forecast-snapshot-observability';
import {
  createCrmForecastSnapshotWorkItemRepository,
  type CrmForecastSnapshotWorkItemRepository,
} from '@/adapters/crm/forecast-snapshot-work-items';
import {
  createCrmForecastSnapshotRepository,
  createCrmReportingRepository,
} from '@/adapters/crm/reporting-repository';

import {
  AdminCrmReportingAccessDeniedError,
  getAdminCrmReportingCore as readAdminCrmReportingDashboard,
  type AdminCrmReportingDashboard,
} from './_core';

export { AdminCrmReportingAccessDeniedError } from './_core';

export const ADMIN_CRM_REPORTING_READ_ONLY_MESSAGE =
  'Admin CRM reporting tenant boundary is read-only';

/** Callers choose presentation only; repositories are owned by this boundary. */
export type AdminCrmReportingTenantOptions = {
  labels?: { noBranch?: string };
  logger?: Pick<Console, 'error'>;
  now?: () => string;
};

export type AdminCrmReportingTenantRepositories = {
  forecastSnapshotObservabilityRepository: CrmForecastSnapshotObservabilityRepository;
  forecastSnapshotRepository: CrmForecastSnapshotRepository;
  forecastSnapshotWorkItemRepository: CrmForecastSnapshotWorkItemRepository;
  reportingRepository: CrmReportingRepository;
};

// One transaction per read: a failing statement aborts only its own transaction, so the
// dashboard keeps settling healthy widgets. Never wrap the whole dashboard in one transaction.
async function readInTenantContext<TRepository, TResult>(
  tenantId: string,
  createRepository: (tx: TenantTransaction) => TRepository,
  read: (repository: TRepository) => Promise<TResult>
): Promise<TResult> {
  return withTenantContext({ tenantId }, tx => read(createRepository(tx)));
}

function tenantBoundReportingRepository(tenantId: string): CrmReportingRepository {
  const read = <TResult>(operation: (repository: CrmReportingRepository) => Promise<TResult>) =>
    readInTenantContext(tenantId, createCrmReportingRepository, operation);
  return {
    listAgentLeaderboardRows: input =>
      read(repository => repository.listAgentLeaderboardRows(input)),
    listFunnelConversionRows: input =>
      read(repository => repository.listFunnelConversionRows(input)),
    listSourceBreakdownRows: input => read(repository => repository.listSourceBreakdownRows(input)),
    listStageVelocityRows: input => read(repository => repository.listStageVelocityRows(input)),
    listWeightedPipelineRows: input =>
      read(repository => repository.listWeightedPipelineRows(input)),
    listWinRateRows: input => read(repository => repository.listWinRateRows(input)),
  };
}

function tenantBoundForecastSnapshotRepository(tenantId: string): CrmForecastSnapshotRepository {
  return {
    // Reporting reads never write snapshots; the writer keeps its own protected boundary.
    async insertPipelineSnapshots() {
      throw new Error(ADMIN_CRM_REPORTING_READ_ONLY_MESSAGE);
    },
    listLatestPipelineSnapshots: params =>
      readInTenantContext(tenantId, createCrmForecastSnapshotRepository, repository =>
        repository.listLatestPipelineSnapshots(params)
      ),
  };
}

function tenantBoundForecastSnapshotObservabilityRepository(
  tenantId: string
): CrmForecastSnapshotObservabilityRepository {
  return {
    listObservedSnapshots: params =>
      readInTenantContext(tenantId, createCrmForecastSnapshotObservabilityRepository, repository =>
        repository.listObservedSnapshots(params)
      ),
  };
}

function tenantBoundForecastSnapshotWorkItemRepository(
  tenantId: string
): CrmForecastSnapshotWorkItemRepository {
  return {
    listWorkItems: params =>
      readInTenantContext(tenantId, createCrmForecastSnapshotWorkItemRepository, repository =>
        repository.listWorkItems(params)
      ),
  };
}

export function createAdminCrmReportingTenantRepositories(
  tenantId: string
): AdminCrmReportingTenantRepositories {
  return {
    forecastSnapshotObservabilityRepository:
      tenantBoundForecastSnapshotObservabilityRepository(tenantId),
    forecastSnapshotRepository: tenantBoundForecastSnapshotRepository(tenantId),
    forecastSnapshotWorkItemRepository: tenantBoundForecastSnapshotWorkItemRepository(tenantId),
    reportingRepository: tenantBoundReportingRepository(tenantId),
  };
}

export async function getAdminCrmReportingCore(
  args: { actor: CrmActorContext },
  options: AdminCrmReportingTenantOptions = {}
): Promise<AdminCrmReportingDashboard> {
  // Authorize before any connection is acquired: denial must never reach the database.
  const tenantId = args.actor.tenantId?.trim();
  if (!tenantId) throw new AdminCrmReportingAccessDeniedError('tenant_scope');
  if (args.actor.role !== 'admin') throw new AdminCrmReportingAccessDeniedError('role_scope');

  const repositories = createAdminCrmReportingTenantRepositories(tenantId);
  // Explicit field list: callers cannot substitute an unbound repository.
  return readAdminCrmReportingDashboard(args, {
    forecastSnapshotObservabilityRepository: repositories.forecastSnapshotObservabilityRepository,
    forecastSnapshotRepository: repositories.forecastSnapshotRepository,
    forecastSnapshotWorkItemRepository: repositories.forecastSnapshotWorkItemRepository,
    labels: options.labels,
    logger: options.logger,
    now: options.now,
    reportingRepository: repositories.reportingRepository,
  });
}
