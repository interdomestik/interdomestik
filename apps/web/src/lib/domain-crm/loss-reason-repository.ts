import type { LossReasonResolver } from '@interdomestik/domain-crm/deals/loss-reason';
import { and, eq, isNull, or } from 'drizzle-orm';

import { db } from '@interdomestik/database/db';
import { crmLossReasons } from '@interdomestik/database/schema';

type CrmLossReasonDb = typeof db;

export function createCrmLossReasonRepository(database: CrmLossReasonDb = db): LossReasonResolver {
  return {
    async resolveLossReason(input) {
      const branchId = input.actor.scope.branchId ?? null;

      // db-access-guard: tenant-scoped -- reason: CRM loss-reason lookup constrains by authorized actor tenant and branch-compatible vocabulary
      const row = await database.query.crmLossReasons.findFirst({
        columns: {
          code: true,
          id: true,
        },
        where: and(
          eq(crmLossReasons.id, input.lossReasonId),
          eq(crmLossReasons.tenantId, input.actor.tenantId),
          isNull(crmLossReasons.archivedAt),
          branchId
            ? or(eq(crmLossReasons.branchId, branchId), isNull(crmLossReasons.branchId))
            : isNull(crmLossReasons.branchId)
        ),
      });

      return row ?? null;
    },
  };
}

export const crmLossReasonRepository = createCrmLossReasonRepository();
