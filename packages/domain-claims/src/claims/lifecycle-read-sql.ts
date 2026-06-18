import { claims } from '@interdomestik/database';
import type { ClaimStatus } from '@interdomestik/database/constants';
import { inArray, not, sql, type SQL, type SQLWrapper } from 'drizzle-orm';

export const LIFECYCLE_ACTIVE_STATUSES: ClaimStatus[] = [
  'submitted',
  'verification',
  'evaluation',
  'negotiation',
  'court',
];
export const LIFECYCLE_CLOSED_STATUSES: ClaimStatus[] = ['resolved', 'rejected'];
export const LIFECYCLE_DRAFT_STATUSES: ClaimStatus[] = ['draft'];

type ClaimLifecycleStatusColumns = {
  caseLifecycleState: SQLWrapper;
  recoveryLifecycleState: SQLWrapper;
  status: SQLWrapper;
};

function claimLifecycleStatusSqlFromColumns(
  columns: ClaimLifecycleStatusColumns
): SQL<ClaimStatus> {
  return sql<ClaimStatus>`case
    when ${columns.caseLifecycleState} = 'draft'
      and ${columns.recoveryLifecycleState} = 'not_started' then 'draft'
    when ${columns.caseLifecycleState} = 'submitted'
      and ${columns.recoveryLifecycleState} = 'not_started' then 'submitted'
    when ${columns.caseLifecycleState} = 'verification'
      and ${columns.recoveryLifecycleState} = 'not_started' then 'verification'
    when ${columns.caseLifecycleState} = 'evaluation'
      and ${columns.recoveryLifecycleState} = 'not_started' then 'evaluation'
    when ${columns.caseLifecycleState} = 'recovery'
      and ${columns.recoveryLifecycleState} = 'negotiation' then 'negotiation'
    when ${columns.caseLifecycleState} = 'recovery'
      and ${columns.recoveryLifecycleState} = 'court' then 'court'
    when ${columns.caseLifecycleState} = 'resolved'
      and ${columns.recoveryLifecycleState} = 'resolved' then 'resolved'
    when ${columns.caseLifecycleState} = 'rejected'
      and ${columns.recoveryLifecycleState} = 'closed' then 'rejected'
    when ${columns.status} in (
      'draft', 'submitted', 'verification', 'evaluation', 'negotiation', 'court',
      'resolved', 'rejected'
    ) then ${columns.status}
    else 'draft'
  end`;
}

function claimAliasColumn(alias: string, column: string): SQL {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(alias)) {
    throw new Error(`Invalid claim SQL alias: ${alias}`);
  }

  return sql.raw(`"${alias}"."${column}"`);
}

export function claimLifecycleStatusSql(): SQL<ClaimStatus> {
  return claimLifecycleStatusSqlFromColumns({
    caseLifecycleState: claims.caseLifecycleState,
    recoveryLifecycleState: claims.recoveryLifecycleState,
    status: claims.status,
  });
}

export function claimLifecycleStatusSqlForAlias(alias: string): SQL<ClaimStatus> {
  return claimLifecycleStatusSqlFromColumns({
    caseLifecycleState: claimAliasColumn(alias, 'case_lifecycle_state'),
    recoveryLifecycleState: claimAliasColumn(alias, 'recovery_lifecycle_state'),
    status: claimAliasColumn(alias, 'status'),
  });
}

export function claimLifecycleStatusIn(statuses: readonly ClaimStatus[]): SQL {
  return inArray(claimLifecycleStatusSql(), [...statuses]);
}

export function claimLifecycleStatusInForAlias(
  alias: string,
  statuses: readonly ClaimStatus[]
): SQL {
  return inArray(claimLifecycleStatusSqlForAlias(alias), [...statuses]);
}

export function claimLifecycleStatusIs(status: ClaimStatus): SQL {
  return sql`${claimLifecycleStatusSql()} = ${status}`;
}

export function claimLifecycleStatusIsForAlias(alias: string, status: ClaimStatus): SQL {
  return sql`${claimLifecycleStatusSqlForAlias(alias)} = ${status}`;
}

export function claimLifecycleStatusNotIn(statuses: readonly ClaimStatus[]): SQL {
  return not(claimLifecycleStatusIn(statuses));
}

export function claimLifecycleStatusNotInForAlias(
  alias: string,
  statuses: readonly ClaimStatus[]
): SQL {
  return not(claimLifecycleStatusInForAlias(alias, statuses));
}
