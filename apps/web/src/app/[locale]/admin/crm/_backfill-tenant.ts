import { withTenantContext } from '@interdomestik/database/tenant';

import { createCrmForecastSnapshotRepository } from '@/adapters/crm/reporting-repository';

import { runCrmForecastSnapshotBackfillCore } from '../../../api/cron/crm/forecast-snapshots/backfill/_core';
import {
  runAdminCrmForecastBackfillOperatorCore as runAuthorizedOperator,
  type RunAdminCrmForecastBackfillOperatorCoreDeps,
} from './_backfill-core';
import { createAdminCrmReportingTenantRepositories } from './_reporting-tenant';

type OperatorOptions = Pick<
  RunAdminCrmForecastBackfillOperatorCoreDeps,
  'headers' | 'logger' | 'now'
>;

// Authorization, tenant equality and confirmation remain in the existing operator core.
// Each repository call owns its transaction so a failed work item cannot abort healthy items.
export function runAdminCrmForecastBackfillOperatorCore(
  args: Parameters<typeof runAuthorizedOperator>[0],
  options: OperatorOptions = {}
): ReturnType<typeof runAuthorizedOperator> {
  return runAuthorizedOperator(args, {
    headers: options.headers,
    logger: options.logger,
    now: options.now,
    runBackfillCore: input => {
      const tenantId = input.tenantId;
      const readers = createAdminCrmReportingTenantRepositories(tenantId);
      return runCrmForecastSnapshotBackfillCore({
        ...input,
        workItemRepository: readers.forecastSnapshotWorkItemRepository,
        reportingRepository: readers.reportingRepository,
        snapshotRepository: {
          listLatestPipelineSnapshots: params =>
            readers.forecastSnapshotRepository.listLatestPipelineSnapshots(params),
          insertPipelineSnapshots: params =>
            withTenantContext({ tenantId }, tx =>
              createCrmForecastSnapshotRepository(tx).insertPipelineSnapshots(params)
            ),
        },
      });
    },
  });
}
