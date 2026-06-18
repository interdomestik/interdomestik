import { claims } from '@interdomestik/database';
import type { ClaimStatus } from '@interdomestik/database/constants';
import { inArray, not, sql, type SQL } from 'drizzle-orm';

export const LIFECYCLE_ACTIVE_STATUSES: ClaimStatus[] = [
  'submitted',
  'verification',
  'evaluation',
  'negotiation',
  'court',
];
export const LIFECYCLE_CLOSED_STATUSES: ClaimStatus[] = ['resolved', 'rejected'];
export const LIFECYCLE_DRAFT_STATUSES: ClaimStatus[] = ['draft'];

export function claimLifecycleStatusSql(): SQL<ClaimStatus> {
  return sql<ClaimStatus>`case
    when ${claims.caseLifecycleState} = 'draft'
      and ${claims.recoveryLifecycleState} = 'not_started' then 'draft'
    when ${claims.caseLifecycleState} = 'submitted'
      and ${claims.recoveryLifecycleState} = 'not_started' then 'submitted'
    when ${claims.caseLifecycleState} = 'verification'
      and ${claims.recoveryLifecycleState} = 'not_started' then 'verification'
    when ${claims.caseLifecycleState} = 'evaluation'
      and ${claims.recoveryLifecycleState} = 'not_started' then 'evaluation'
    when ${claims.caseLifecycleState} = 'recovery'
      and ${claims.recoveryLifecycleState} = 'negotiation' then 'negotiation'
    when ${claims.caseLifecycleState} = 'recovery'
      and ${claims.recoveryLifecycleState} = 'court' then 'court'
    when ${claims.caseLifecycleState} = 'resolved'
      and ${claims.recoveryLifecycleState} = 'resolved' then 'resolved'
    when ${claims.caseLifecycleState} = 'rejected'
      and ${claims.recoveryLifecycleState} = 'closed' then 'rejected'
    when ${claims.status} in (
      'draft', 'submitted', 'verification', 'evaluation', 'negotiation', 'court',
      'resolved', 'rejected'
    ) then ${claims.status}
    else 'draft'
  end`;
}

export function claimLifecycleStatusIn(statuses: readonly ClaimStatus[]): SQL {
  return inArray(claimLifecycleStatusSql(), [...statuses]);
}

export function claimLifecycleStatusIs(status: ClaimStatus): SQL {
  return sql`${claimLifecycleStatusSql()} = ${status}`;
}

export function claimLifecycleStatusNotIn(statuses: readonly ClaimStatus[]): SQL {
  return not(claimLifecycleStatusIn(statuses));
}
