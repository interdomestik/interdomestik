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
export type RegisterActor = Pick<TenantAuthorityPrincipal, 'userId' | 'role' | 'branchId'>;
export type LockedRegister = { tx: TenantTransaction; tenantId: string; actorId: string };

// The action schema form admits checks, not transforms: commands trim after parsing.
export function registerText(maxLength: number) {
  return z
    .string()
    .min(1)
    .max(maxLength)
    .regex(/\S/)
    .refine(value => !value.includes('\u0000'));
}

export const registerTimestamp = z.iso
  .datetime({ offset: true })
  .refine(value => Number.isFinite(Date.parse(value)));
export const registerId = z
  .string()
  .min(1)
  .refine(value => !value.includes('\u0000'));
export const registerUuid = z.uuid();

const registerUuidFields = [
  'correlationId',
  'inReplyToId',
  'recoveryAuthorityId',
  'representationAuthorityId',
  'sharingAuthorityId',
  'authorityId',
  'correspondenceId',
] as const;

/**
 * Each write command normalizes its parsed input (the action schema form admits no transform):
 * text is trimmed, and UUIDs are lower-cased because PostgreSQL returns them in lower case and
 * replay and basis lookups compare them as strings.
 */
export function normalizeRegisterInput<T extends object>(input: T): T {
  const result = { ...input } as Record<string, unknown>;
  for (const [field, value] of Object.entries(result)) {
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    result[field] = (registerUuidFields as readonly string[]).includes(field)
      ? trimmed.toLowerCase()
      : trimmed;
  }
  return result as T;
}
export const registerClaimInput = z.object({ claimId: registerId }).strict();

// Read at call time: importers may load this module under a partial shared-auth mock.
function isAdminRole(role: string | null | undefined) {
  return role === ROLES.admin || role === ROLES.tenant_admin;
}

function canEnterRegister(mode: RegisterMode, actor: RegisterActor) {
  if (mode === 'summary') return actor.role === ROLES.branch_manager && Boolean(actor.branchId);
  if (actor.role === ROLES.staff || isAdminRole(actor.role)) return true;
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

/**
 * The register admission for the staff queue's register deadlines: the same session-home,
 * principal and branch checks as a register read, for an assigned staff member only.
 */
export function resolveRegisterQueueActor(
  session: ClaimsSession | null,
  authority: TenantAuthority | null
) {
  const access = resolveRegisterActor(session, authority, 'full');
  return access?.actor.role === ROLES.staff ? access : null;
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

export function resolveRegisterRead<I extends { claimId: string } = { claimId: string }>(
  session: ClaimsSession | null,
  authority: TenantAuthority | null,
  input: unknown,
  mode: 'full' | 'summary',
  schema: z.ZodType<I> = registerClaimInput as unknown as z.ZodType<I>
) {
  return resolveRegisterAccess(session, authority, input, mode, schema);
}

/** The largest register page; the web clamps request values to it before calling (R-20). */
export const REGISTER_MAX_PAGE_SIZE = 50;
export const registerPageInput = registerClaimInput.extend({
  page: z.number().int().min(1).max(100_000),
  perPage: z.number().int().min(1).max(REGISTER_MAX_PAGE_SIZE),
});

function sqlState(error: unknown, depth = 0): string | undefined {
  if (!error || typeof error !== 'object' || depth > 3) return undefined;
  if ('code' in error && typeof error.code === 'string') return error.code;
  return 'cause' in error ? sqlState(error.cause, depth + 1) : undefined;
}

/**
 * A direct SQL revocation locks the authority row before its trigger locks the claim, while a
 * command locks the claim first; PostgreSQL then aborts one side with 40P01. The command runs
 * its whole transaction once more: it is idempotent by correlation id or by revoker.
 */
export function retryRegisterDeadlock(error: unknown, attempt: number) {
  return attempt === 1 && sqlState(error) === '40P01';
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
