import { db } from '@interdomestik/database';
import {
  agentClients,
  agentCommissions,
  subscriptions,
  user as userTable,
} from '@interdomestik/database/schema';
import { and, eq, inArray } from 'drizzle-orm';

import {
  assertFinancePayability,
  combineControlViolations,
  type ControlViolation,
  type ControlResult,
} from '../../enterprise-controls';

type CommissionPayabilityRow = {
  id: string;
  status: string;
  memberId: string | null;
  subscriptionStatus: string | null;
  subscriptionAgentId: string | null;
  userAgentId: string | null;
  cancelAtPeriodEnd: boolean | null;
  gracePeriodEndsAt: Date | null;
};

type AgentClientBindingRow = {
  memberId: string;
  agentId: string;
};

export async function preflightCommissionPayability(args: {
  tenantId: string;
  ids: string[];
  now?: Date;
}): Promise<ControlResult<CommissionPayabilityRow[]>> {
  const ids = [...new Set(args.ids.filter(id => id.trim().length > 0))];
  if (ids.length === 0) {
    return { ok: true, value: [] };
  }

  const rows = await fetchCommissionPayabilityRows({
    tenantId: args.tenantId,
    ids,
  });
  const rowsById = new Map(rows.map(row => [row.id, row]));
  const missingIds = ids.filter(id => !rowsById.has(id));
  const violations: ControlViolation[] =
    missingIds.length > 0
      ? [
          {
            control: 'finance' as const,
            code: 'COMMISSION_NOT_FOUND',
            detail: `Commission ids were not found for tenant: ${missingIds.join(', ')}`,
            recoverable: false,
            entityIds: missingIds,
          },
        ]
      : [];

  const agentClientBindings = await fetchActiveAgentClientBindings({
    tenantId: args.tenantId,
    memberIds: rows.map(row => row.memberId).filter((id): id is string => Boolean(id)),
  });
  const agentClientAgentIdsByMemberId = groupAgentClientBindings(agentClientBindings);

  for (const row of rows) {
    const agentClientAgentIds = row.memberId
      ? (agentClientAgentIdsByMemberId.get(row.memberId) ?? [])
      : undefined;
    const subscription =
      row.subscriptionStatus == null
        ? null
        : {
            status: row.subscriptionStatus,
            cancelAtPeriodEnd: row.cancelAtPeriodEnd,
            gracePeriodEndsAt: row.gracePeriodEndsAt,
          };
    const payability = assertFinancePayability({
      commissionId: row.id,
      subscriptionAgentId: row.subscriptionAgentId,
      userAgentId: row.userAgentId,
      agentClientAgentIds,
      subscription,
      now: args.now,
    });

    if (!payability.ok) {
      violations.push(payability.violation);
    }
  }

  if (violations.length > 0) {
    return {
      ok: false,
      violation: combineControlViolations({
        control: 'finance',
        code: 'FINANCE_BATCH_PAYABILITY_BLOCKED',
        detail: 'One or more commissions are not payable under enterprise controls',
        violations,
      }),
    };
  }

  return { ok: true, value: rows };
}

async function fetchCommissionPayabilityRows(args: {
  tenantId: string;
  ids: string[];
}): Promise<CommissionPayabilityRow[]> {
  if (args.ids.length === 0) return [];

  return db
    .select({
      id: agentCommissions.id,
      status: agentCommissions.status,
      memberId: agentCommissions.memberId,
      subscriptionStatus: subscriptions.status,
      subscriptionAgentId: subscriptions.agentId,
      userAgentId: userTable.agentId,
      cancelAtPeriodEnd: subscriptions.cancelAtPeriodEnd,
      gracePeriodEndsAt: subscriptions.gracePeriodEndsAt,
    })
    .from(agentCommissions)
    .leftJoin(
      subscriptions,
      and(
        eq(agentCommissions.tenantId, subscriptions.tenantId),
        eq(agentCommissions.subscriptionId, subscriptions.id)
      )
    )
    .leftJoin(
      userTable,
      and(
        eq(agentCommissions.tenantId, userTable.tenantId),
        eq(agentCommissions.memberId, userTable.id)
      )
    )
    .where(
      and(eq(agentCommissions.tenantId, args.tenantId), inArray(agentCommissions.id, args.ids))
    );
}

async function fetchActiveAgentClientBindings(args: {
  tenantId: string;
  memberIds: string[];
}): Promise<AgentClientBindingRow[]> {
  const memberIds = [...new Set(args.memberIds)];
  if (memberIds.length === 0) return [];

  return db
    .select({
      memberId: agentClients.memberId,
      agentId: agentClients.agentId,
    })
    .from(agentClients)
    .where(
      and(
        eq(agentClients.tenantId, args.tenantId),
        eq(agentClients.status, 'active'),
        inArray(agentClients.memberId, memberIds)
      )
    );
}

function groupAgentClientBindings(rows: AgentClientBindingRow[]): Map<string, string[]> {
  const bindings = new Map<string, string[]>();
  for (const row of rows) {
    const existing = bindings.get(row.memberId) ?? [];
    existing.push(row.agentId);
    bindings.set(row.memberId, existing);
  }

  return bindings;
}
