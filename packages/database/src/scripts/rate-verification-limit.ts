import type { DisposableClient } from '../disposable-client';

const receiptAction = 'release.exchange_rate_verification_limit.set';
const receiptEntity = 'exchange_rate_verification_limit';

export type RateVerificationLimitOperation = Readonly<{
  tenantId: string;
  maxAgeSeconds: number | null;
  operationId: string;
  approvalReference: string;
  releaseIdentity: string;
}>;

export class RateVerificationLimitPrivilegedRoleError extends Error {
  constructor() {
    super('Rate verification limit operations require a login subject to row-level security');
  }
}

function isLimit(value: unknown): value is number | null {
  return (
    value === null ||
    (typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 2678400)
  );
}

function isRequiredText(value: unknown): boolean {
  return (
    typeof value === 'string' &&
    /\S/u.test(value) &&
    !value.includes('\0') &&
    !/[\uD800-\uDFFF]/u.test(value)
  );
}

function validateOperation({
  tenantId,
  maxAgeSeconds,
  operationId,
  approvalReference,
  releaseIdentity,
}: RateVerificationLimitOperation) {
  if (
    !isLimit(maxAgeSeconds) ||
    ![tenantId, operationId, approvalReference, releaseIdentity].every(isRequiredText)
  ) {
    throw new Error('Invalid rate verification limit operation');
  }
}

type ReleaseTransaction = Parameters<Parameters<DisposableClient['begin']>[1]>[0];

async function bindReleaseTenant(tx: ReleaseTransaction, tenantId: string) {
  const [role] = await tx<{ allowed: boolean | null }[]>`
    select bool_and(not (rolsuper or rolbypassrls)) and not exists (
      select 1 from pg_catalog.pg_class
      where oid in ('public.audit_log'::pg_catalog.regclass,
        'public.exchange_rate_verification_limits'::pg_catalog.regclass)
        and (pg_catalog.pg_has_role(session_user, relowner, 'MEMBER')
          or pg_catalog.pg_has_role(current_user, relowner, 'MEMBER'))
    ) as allowed
    from pg_catalog.pg_roles where rolname in (session_user, current_user)`;
  if (role?.allowed !== true) throw new RateVerificationLimitPrivilegedRoleError();
  await tx`set local row_security = on`;
  await tx`select set_config('app.current_tenant_id', ${tenantId}, true),
    set_config('app.current_access_tenant_id', ${tenantId}, true)`;
}

function requestedMetadata({
  maxAgeSeconds,
  approvalReference,
  releaseIdentity,
}: RateVerificationLimitOperation) {
  return { maxAgeSeconds, approvalReference, releaseIdentity };
}

async function readReleaseState(tx: ReleaseTransaction, operation: RateVerificationLimitOperation) {
  const { tenantId, operationId } = operation;
  const [state] = await tx<
    {
      present: boolean;
      prior: unknown;
      matches: boolean | null;
      current: number | null;
    }[]
  >`
    select receipt.id is not null as present, receipt.metadata -> 'priorMaxAgeSeconds' as prior,
      (receipt.action = ${receiptAction} and receipt.entity_type = ${receiptEntity}
        and receipt.entity_id = scope.tenant_id and receipt.metadata ? 'priorMaxAgeSeconds'
        and receipt.metadata @> ${JSON.stringify(requestedMetadata(operation))}::text::jsonb) as matches,
      limits.max_age_seconds as current
    from (select ${tenantId}::text as tenant_id) as scope
    left join public.audit_log as receipt on receipt.tenant_id = scope.tenant_id
      and receipt.id = ${operationId}
    left join public.exchange_rate_verification_limits as limits on limits.tenant_id = scope.tenant_id`;
  return state;
}

/** Uses the release writer's connection and resolves with a receipt only after commit. */
export async function setRateVerificationLimit(
  client: DisposableClient,
  operation: RateVerificationLimitOperation
) {
  validateOperation(operation);
  const { tenantId, maxAgeSeconds, operationId } = operation;
  return await client.begin('isolation level read committed', async tx => {
    await bindReleaseTenant(tx, tenantId);
    const [book] = await tx`select id from public.exchange_rate_books
      where tenant_id = ${tenantId} and base = 'EUR' and quote = 'MKD'
      for update`;
    if (!book) throw new Error('Rate verification limit requires an exchange rate book');

    const {
      present,
      matches,
      prior,
      current: priorMaxAgeSeconds,
    } = await readReleaseState(tx, operation);
    if (present) {
      if (!matches || !isLimit(prior)) {
        throw new Error('Rate verification limit operation ID conflicts with an audit receipt');
      }
      return { receiptId: operationId, priorMaxAgeSeconds: prior, maxAgeSeconds };
    }

    if (maxAgeSeconds === null) {
      await tx`delete from public.exchange_rate_verification_limits where tenant_id = ${tenantId}`;
    } else {
      await tx`insert into public.exchange_rate_verification_limits (tenant_id, max_age_seconds)
        values (${tenantId}, ${maxAgeSeconds})
        on conflict (tenant_id) do update set max_age_seconds = excluded.max_age_seconds`;
    }

    await tx`insert into public.audit_log (id, tenant_id, action, entity_type, entity_id, metadata)
      values (${operationId}, ${tenantId}, ${receiptAction}, ${receiptEntity}, ${tenantId},
        ${JSON.stringify({ priorMaxAgeSeconds, ...requestedMetadata(operation) })}::text::jsonb)`;
    return { receiptId: operationId, priorMaxAgeSeconds, maxAgeSeconds };
  });
}

/**
 * The release pipeline calls this read-only lookup first after an uncertain commit.
 * Before relying on `absent`, confirm the original release transaction has ended by checking
 * that its connection is closed or that the transaction no longer appears in `pg_stat_activity`.
 * Then re-run the lookup. If it still reports `absent`, re-decide with the current limit in view.
 * Blindly retrying the set could reopen sales after a later removal.
 */
export async function checkRateVerificationLimitReceipt(
  client: DisposableClient,
  operation: RateVerificationLimitOperation
) {
  validateOperation(operation);
  const { operationId: receiptId, maxAgeSeconds } = operation;
  return await client.begin('isolation level read committed read only', async tx => {
    await bindReleaseTenant(tx, operation.tenantId);
    const { present, matches, prior, current } = await readReleaseState(tx, operation);
    if (!present) return { status: 'absent', currentMaxAgeSeconds: current } as const;
    if (!matches || !isLimit(prior)) return { status: 'conflict', receiptId } as const;
    return { status: 'matching', receiptId, priorMaxAgeSeconds: prior, maxAgeSeconds } as const;
  });
}
