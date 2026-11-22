import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';

import { auditLog } from './schema/notes';
import { tenantSettings } from './schema/tenants';
import type { TenantTransaction } from './tenant';
import { readTenantAuthority, type TenantAuthority } from './tenant-authority';
import { withTenant } from './tenant-security';

export const PILOT_SWITCH_CATEGORY = 'pilot';
export const PILOT_SWITCH_KEYS = Object.freeze(['public_intake', 'new_sales'] as const);
export type PilotSwitchKey = (typeof PILOT_SWITCH_KEYS)[number];

export type PilotSwitchState = {
  state: 'open' | 'closed';
  revision: number;
  wellFormed: boolean;
};

function parsePilotSwitch(value: unknown): PilotSwitchState {
  const closed: PilotSwitchState = { state: 'closed', revision: 0, wellFormed: false };
  if (!value || typeof value !== 'object') return closed;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return closed;
  if (Reflect.ownKeys(value).length !== 2) return closed;

  const enabled: unknown = Object.getOwnPropertyDescriptor(value, 'enabled')?.value;
  const revision: unknown = Object.getOwnPropertyDescriptor(value, 'revision')?.value;
  if (
    typeof enabled !== 'boolean' ||
    typeof revision !== 'number' ||
    !Number.isSafeInteger(revision) ||
    revision < 1
  ) {
    return closed;
  }
  return { state: enabled ? 'open' : 'closed', revision, wellFormed: true };
}

function pilotSwitchWhere(tenantId: string, key: PilotSwitchKey) {
  if (!PILOT_SWITCH_KEYS.includes(key)) throw new TypeError('Unknown pilot switch key');
  return withTenant(
    tenantId,
    tenantSettings.tenantId,
    and(eq(tenantSettings.category, PILOT_SWITCH_CATEGORY), eq(tenantSettings.key, key))
  );
}

export async function readPilotSwitch(
  tx: TenantTransaction,
  tenantId: string,
  key: PilotSwitchKey,
  options: { lock?: 'share' } = {}
): Promise<PilotSwitchState> {
  const where = pilotSwitchWhere(tenantId, key);
  const query = tx
    .select({ value: tenantSettings.value })
    .from(tenantSettings)
    .where(where)
    .limit(1);
  const [row] = await (options.lock === 'share' ? query.for('share') : query);
  return parsePilotSwitch(row?.value);
}

export class SalesClosedError extends Error {
  readonly code = 'CLOSED';

  constructor() {
    super('New sales are closed');
    this.name = 'SalesClosedError';
  }
}

export async function assertNewSalesOpen(tx: TenantTransaction, tenantId: string): Promise<void> {
  const admission = await readPilotSwitch(tx, tenantId, 'new_sales', { lock: 'share' });
  if (admission.state === 'closed') throw new SalesClosedError();
}

export type PilotSwitchChange = {
  key: PilotSwitchKey;
  enabled: boolean;
  expectedRevision: number;
  reason: string;
  approvalReference?: string;
};

type PilotSwitchChangeResult =
  | { ok: true; switch: PilotSwitchState }
  | { ok: false; code: 'FORBIDDEN' | 'APPROVAL_REQUIRED' | 'CONFLICT' };

export async function changePilotSwitch(
  tx: TenantTransaction,
  authority: TenantAuthority,
  input: PilotSwitchChange
): Promise<PilotSwitchChangeResult> {
  const { accessTenantId: tenantId, principal } = readTenantAuthority(authority);
  const { key, enabled, expectedRevision, reason, approvalReference } = input;
  if (principal?.role !== 'super_admin' && principal?.role !== 'tenant_admin') {
    return { ok: false, code: 'FORBIDDEN' };
  }
  if (enabled && principal.role !== 'super_admin') return { ok: false, code: 'FORBIDDEN' };
  if (enabled && !approvalReference?.trim()) return { ok: false, code: 'APPROVAL_REQUIRED' };

  const where = pilotSwitchWhere(tenantId, key);
  const [row] = await tx
    .select({ id: tenantSettings.id, value: tenantSettings.value })
    .from(tenantSettings)
    .where(where)
    .limit(1)
    .for('update');
  const previous = parsePilotSwitch(row?.value);
  if (previous.revision !== expectedRevision || previous.revision === Number.MAX_SAFE_INTEGER) {
    return { ok: false, code: 'CONFLICT' };
  }

  const value = { enabled, revision: previous.revision + 1 };
  const changed = row
    ? await tx
        .update(tenantSettings)
        .set({ value })
        .where(eq(tenantSettings.id, row.id))
        .returning({ id: tenantSettings.id })
    : await tx
        .insert(tenantSettings)
        .values({ id: randomUUID(), tenantId, category: PILOT_SWITCH_CATEGORY, key, value })
        .onConflictDoNothing({
          target: [tenantSettings.tenantId, tenantSettings.category, tenantSettings.key],
        })
        .returning({ id: tenantSettings.id });
  const [saved] = changed;
  if (!saved) return { ok: false, code: 'CONFLICT' };

  const state = parsePilotSwitch(value);
  await tx.insert(auditLog).values({
    id: randomUUID(),
    tenantId,
    actorId: principal.userId,
    actorRole: principal.role,
    action: 'pilot_switch.changed',
    entityType: 'pilot_switch',
    entityId: saved.id,
    metadata: {
      key,
      from: previous.state,
      to: state.state,
      fromRevision: previous.revision,
      toRevision: state.revision,
      reason,
      approvalReference: approvalReference ?? null,
      ...(row && !previous.wellFormed ? { observedMalformedValue: row.value } : {}),
    },
  });
  return { ok: true, switch: state };
}
