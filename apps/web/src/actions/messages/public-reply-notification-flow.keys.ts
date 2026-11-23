/** Unique keys of the reply-flow fixture tables; kept equal to the schema by the keys test. */
import type { Row } from './public-reply-notification-flow.data';

export type UniqueKey = {
  name: string;
  /** Property names for a column key; null for an expression index, which is never a column target. */
  columns: readonly string[] | null;
  of: (row: Row) => unknown[];
};

const key = (name: string, ...fields: string[]): UniqueKey => ({
  name,
  columns: fields,
  of: row => fields.map(field => row[field]),
});
const expression = (name: string, of: (row: Row) => unknown[]): UniqueKey => ({
  name,
  columns: null,
  of,
});

// Primary keys, column uniques and unique indexes of the schema, plus the SQL-managed unique
// indexes of scripts/ci/sql-managed-objects.json.
export const UNIQUE_KEYS: Record<string, readonly UniqueKey[]> = {
  claims: [
    key('pk', 'id'),
    key('claim_tenant_id_id_uq', 'tenantId', 'id'),
    key('idx_claims_tenant_number', 'tenantId', 'claimNumber'),
  ],
  user: [
    key('pk', 'id'),
    key('email', 'email'),
    key('referralCode', 'referralCode'),
    key('user_tenant_id_id_uq', 'tenantId', 'id'),
    expression('user_email_lower_unique', row => [
      // lower(btrim(email)): btrim without characters strips spaces only, not tabs or newlines.
      typeof row.email === 'string' ? row.email.replace(/^ +| +$/g, '').toLowerCase() : row.email,
    ]),
  ],
  agentClients: [
    key('pk', 'id'),
    key('agent_clients_tenant_agent_member_uq', 'tenantId', 'agentId', 'memberId'),
  ],
  claimMessages: [
    key('pk', 'id'),
    key('claim_messages_tenant_claim_id_uq', 'tenantId', 'claimId', 'id'),
  ],
  notifications: [key('pk', 'id')],
  notificationDeliveries: [
    key('pk', 'id'),
    key('notification_deliveries_tenant_id_uq', 'tenantId', 'id'),
    key('notification_deliveries_key_uq', 'tenantId', 'idempotencyKey'),
  ],
  claimResponseRequests: [
    key('pk', 'id'),
    expression('claim_response_requests_source_uq', row => [
      row.tenantId,
      row.kind,
      row.sourceMessageId ?? row.claimId,
    ]),
  ],
  auditLog: [key('pk', 'id')],
  pushSubscriptions: [key('pk', 'id'), key('endpoint', 'endpoint')],
  userNotificationPreferences: [key('pk', 'id'), key('userId', 'userId')],
};

/** Partial unique indexes the model does not evaluate: the reply path never inserts users. */
export const NOT_MODELLED = { user: ['user_member_number_idx'] } as const;

/** The unique key an ON CONFLICT target names, compared as a set of columns, as PostgreSQL does. */
function arbiterOf(keys: readonly UniqueKey[], target: readonly string[]): UniqueKey {
  const wanted = new Set(target);
  const arbiter = keys.find(
    candidate =>
      candidate.columns !== null &&
      candidate.columns.length === wanted.size &&
      candidate.columns.every(field => wanted.has(field))
  );
  if (!arbiter) throw new Error('No unique key matches the ON CONFLICT target');
  return arbiter;
}

/**
 * Appends the rows of one statement. A row that repeats a unique key of an existing row or of an
 * earlier row in the statement is skipped under ON CONFLICT DO NOTHING when that key is the
 * arbiter (or no target is named); otherwise the whole statement fails before any write. A key
 * with a null part never conflicts, as in a PostgreSQL unique index.
 */
export function insertUnique(
  name: string,
  target: Row[],
  inputs: readonly Row[],
  onConflict: { target: string[] | null } | null
): Row[] {
  const keys = UNIQUE_KEYS[name];
  if (!keys) throw new Error(`No unique keys declared for fixture table ${name}`);
  const arbiter = onConflict?.target ? arbiterOf(keys, onConflict.target) : null;
  const valueOf = (row: Row, unique: UniqueKey) => {
    const parts = unique.of(row);
    return parts.some(part => part == null) ? null : JSON.stringify(parts);
  };
  const seen = keys.map(unique => new Set(target.map(row => valueOf(row, unique))));
  const fresh: Row[] = [];
  for (const row of inputs) {
    const hits = keys.filter((unique, index) => {
      const value = valueOf(row, unique);
      return value !== null && seen[index].has(value);
    });
    if (hits.length > 0) {
      const skipped = onConflict !== null && (arbiter === null || hits.includes(arbiter));
      if (!skipped) throw new Error('Duplicate fixture key');
      continue;
    }
    keys.forEach((unique, index) => seen[index].add(valueOf(row, unique)));
    fresh.push(row);
  }
  target.push(
    ...fresh.map(row => ({ createdAt: new Date('2026-10-15T00:00:00Z'), readAt: null, ...row }))
  );
  return fresh;
}
