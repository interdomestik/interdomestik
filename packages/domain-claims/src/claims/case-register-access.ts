import {
  and,
  asc,
  claimDocuments,
  claims,
  eq,
  inArray,
  sql,
  type TenantTransaction,
} from '@interdomestik/database';
import {
  isTenantAuthority,
  readTenantAuthority,
  type TenantAuthority,
  type TenantAuthorityPrincipal,
} from '@interdomestik/database/tenant-authority';
import { withTenant } from '@interdomestik/database/tenant-security';
import { ROLES } from '@interdomestik/shared-auth';
import { z } from 'zod';
import { buildStaffClaimReadScope } from '../staff-claims/scope';
import { claimLifecycleStatusNotIn } from './lifecycle-read-sql';
import type { ClaimsSession } from './types';

export type CaseRegisterError =
  'invalid' | 'forbidden' | 'invalid_state' | 'authority_invalid' | 'document_invalid' | 'conflict';

export type CaseRegisterResult<T extends object> =
  ({ ok: true } & T) | { ok: false; code: CaseRegisterError };

type RegisterMode = 'write' | 'full' | 'summary';
type RegisterActor = Pick<TenantAuthorityPrincipal, 'userId' | 'role' | 'branchId'>;
export type LockedRegister = { tx: TenantTransaction; tenantId: string; actorId: string };

export function registerText(maxLength: number) {
  return z
    .string()
    .trim()
    .min(1)
    .max(maxLength)
    .refine(value => !value.includes('\u0000'));
}

export const registerTimestamp = z.iso
  .datetime({ offset: true })
  .refine(value => Number.isFinite(Date.parse(value)));
export const registerId = z
  .string()
  .min(1)
  .refine(value => !value.includes('\u0000'));
export const registerClaimInput = z.object({ claimId: registerId }).strict();

const adminRoles = new Set<string>([ROLES.admin, ROLES.tenant_admin]);

function canEnterRegister(mode: RegisterMode, actor: RegisterActor) {
  if (mode === 'summary') return actor.role === ROLES.branch_manager && Boolean(actor.branchId);
  if (actor.role === ROLES.staff || adminRoles.has(actor.role ?? '')) return true;
  return mode === 'full' && actor.role === ROLES.super_admin;
}

function resolveRegisterActor(
  session: ClaimsSession | null,
  authority: TenantAuthority | null,
  mode: RegisterMode
) {
  if (!session?.user || !authority || !isTenantAuthority(authority)) return null;
  const { tenantId, accessTenantId, purpose, principal } = readTenantAuthority(authority);
  if (purpose !== 'session' && purpose !== 'test') return null;
  if (tenantId !== accessTenantId || tenantId !== session.user.tenantId?.trim()) return null;
  if (principal?.userId !== session.user.id || principal.role !== session.user.role) {
    return null;
  }
  if (principal.branchId !== (session.user.branchId?.trim() || null)) return null;
  return canEnterRegister(mode, principal) ? { tenantId, actor: principal } : null;
}

function registerCaseWhere(
  tenantId: string,
  claimId: string,
  actor: RegisterActor,
  mode: RegisterMode
) {
  const conditions = [eq(claims.id, claimId)];
  if (actor.role === ROLES.staff || mode === 'summary') {
    const scope = buildStaffClaimReadScope({
      claimId,
      role: actor.role ?? undefined,
      branchId: actor.branchId,
      userId: actor.userId,
    });
    if (scope) conditions.push(scope);
    if (mode === 'write') conditions.push(eq(claims.staffId, actor.userId));
  } else {
    conditions.push(claimLifecycleStatusNotIn(['draft']));
  }
  return withTenant(tenantId, claims.tenantId, and(...conditions));
}

export async function lockCaseForRegister(
  tx: TenantTransaction,
  tenantId: string,
  claimId: string,
  actor: RegisterActor,
  mode: RegisterMode = 'write'
) {
  const [claim] = await tx
    .select({ id: claims.id })
    .from(claims)
    .where(registerCaseWhere(tenantId, claimId, actor, mode))
    .for(mode === 'write' ? 'update' : 'share');
  return Boolean(claim);
}

const guardCodes: Partial<Record<string, CaseRegisterError>> = {
  P1201: 'invalid_state',
  P1202: 'authority_invalid',
  P1203: 'document_invalid',
  P1204: 'invalid',
  P1205: 'conflict',
};

function registerGuardError(error: unknown): CaseRegisterError | undefined {
  if (!error || typeof error !== 'object') return undefined;
  if ('code' in error && typeof error.code === 'string') {
    if (Object.hasOwn(guardCodes, error.code)) return guardCodes[error.code];
    if (
      error.code === '23505' &&
      'constraint_name' in error &&
      error.constraint_name === 'claim_authorities_claim_kind_uq'
    )
      return 'conflict';
  }
  if ('cause' in error && error.cause !== error) return registerGuardError(error.cause);
  return undefined;
}

export const registerForbidden = { ok: false, code: 'forbidden' } as const;

type RegisterDenied = { ok: false; code: CaseRegisterError };
type RegisterAccess<I> = {
  ok: true;
  authority: TenantAuthority;
  tenantId: string;
  actor: RegisterActor;
  data: I;
};

function resolveRegisterAccess<I>(
  session: ClaimsSession | null,
  authority: TenantAuthority | null,
  input: unknown,
  mode: RegisterMode,
  schema: z.ZodType<I>
): RegisterAccess<I> | RegisterDenied {
  const access = resolveRegisterActor(session, authority, mode);
  if (!access || !authority) return registerForbidden;
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, code: 'invalid' };
  return { ok: true, authority, tenantId: access.tenantId, actor: access.actor, data: parsed.data };
}

// Each command opens its own tenant transaction, locks the case with lockCaseForRegister and
// calls its named step, so the transaction never reaches a callback parameter (tenant guard L1).
export function resolveRegisterWrite<I extends { claimId: string }>(
  session: ClaimsSession | null,
  authority: TenantAuthority | null,
  input: unknown,
  schema: z.ZodType<I>
) {
  return resolveRegisterAccess(session, authority, input, 'write', schema);
}

export function resolveRegisterRead(
  session: ClaimsSession | null,
  authority: TenantAuthority | null,
  input: unknown,
  mode: 'full' | 'summary'
) {
  return resolveRegisterAccess(session, authority, input, mode, registerClaimInput);
}

// A refused database guard becomes its typed failure; any other error is rethrown (R-08).
export function registerFailure(error: unknown): RegisterDenied {
  const code = registerGuardError(error);
  if (code) return { ok: false, code };
  throw error;
}

export async function lockRegisterDocuments(
  tx: TenantTransaction,
  tenantId: string,
  claimId: string,
  ids: readonly string[]
) {
  if (ids.length === 0) return [];
  const rows = await tx
    .select({
      id: claimDocuments.id,
      bucket: claimDocuments.bucket,
      filePath: claimDocuments.filePath,
      citationRef: claimDocuments.citationRef,
    })
    .from(claimDocuments)
    .where(
      withTenant(
        tenantId,
        claimDocuments.tenantId,
        and(eq(claimDocuments.claimId, claimId), inArray(claimDocuments.id, ids))
      )
    )
    .orderBy(asc(claimDocuments.id))
    .for('share');
  if (rows.length !== ids.length) return null;
  const [{ eligible }] = await tx
    .select({
      eligible: sql<boolean>`bool_and(public.claim_document_provenance_ok(${claimDocuments.tenantId}, ${claimDocuments.claimId}, ${claimDocuments.id}))`,
    })
    .from(claimDocuments)
    .where(
      withTenant(
        tenantId,
        claimDocuments.tenantId,
        and(eq(claimDocuments.claimId, claimId), inArray(claimDocuments.id, ids))
      )
    );
  return eligible ? rows : null;
}

export async function registerDecisionTime(tx: TenantTransaction): Promise<Date> {
  const [row] = await tx
    .select({ now: sql<string | Date>`pg_catalog.clock_timestamp()` })
    .from(sql`(values (1)) as decision_clock`);
  return new Date(row.now);
}
