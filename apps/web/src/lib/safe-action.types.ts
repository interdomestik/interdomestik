import type { auth } from '@/lib/auth';
import type { Role } from '@interdomestik/shared-auth';
import type { TenantAuthority } from '@interdomestik/database/tenant-authority';

// The canonical result of every server action (R-20: one result type).
export type ActionError = {
  success: false;
  error: string;
  code?: string;
  issues?: Record<string, string>;
  /** Seconds until a limited caller may retry (RATE_LIMITED, SERVICE_UNAVAILABLE). */
  retryAfter?: number;
};

export type ActionSuccess<T> = {
  success: true;
  data?: T;
};

export type ActionResult<T> = Promise<ActionSuccess<T> | ActionError>;

export type SessionData = NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>;

// The canonical action context (R-20).
export type ProtectedActionContext = {
  session: SessionData;
  /** Tenant capability for withTenantContext, minted from this request's session. */
  authority: TenantAuthority;
  tenantId: string;
  requestHeaders: Headers;
  userRole: string;
  scope: {
    branchId: string | null;
    actorAgentId: string | null;
    attributedAgentId: string | null;
  };
};

export type PublicActionContext = { requestHeaders: Headers };

/** A role of the catalogue: shared-auth's `ROLES`, the one source of role names (R-20, R-30). */
export type PortalRole = Role;

/** The declared authorization basis of an action (R-05). */
export type ActionBasis =
  | { kind: 'role'; roles: readonly PortalRole[] }
  | { kind: 'self' }
  | { kind: 'public'; entry: string };

export type CtxFor<B extends ActionBasis> = B extends { kind: 'public' }
  ? PublicActionContext
  : ProtectedActionContext;

/** Codes that mean "this caller may not do this": each one is recorded as a refusal. */
export const REFUSAL_CODES = Object.freeze([
  'UNAUTHORIZED',
  'MISSING_TENANT',
  'FORBIDDEN',
  'FORBIDDEN_NO_BRANCH',
  'FORBIDDEN_NO_AGENT',
  'FORBIDDEN_SCOPE_MISMATCH',
] as const);

export type RefusalCode = (typeof REFUSAL_CODES)[number];

export function isRefusalCode(code: unknown): code is RefusalCode {
  return typeof code === 'string' && (REFUSAL_CODES as readonly string[]).includes(code);
}

/** Subjects whose refusals count toward trigger (a) of DIRECTION 6.4. */
export const COUNTED_SUBJECT_TYPES = Object.freeze(['claim', 'document', 'share_pack'] as const);

export const SUBJECT_TYPES = Object.freeze([
  ...COUNTED_SUBJECT_TYPES,
  'member',
  'lead',
  'branch',
  'user',
] as const);

export type SubjectType = (typeof SUBJECT_TYPES)[number];

/** What the refusal record names as the target; read from the raw input, never parsed. */
export type ActionSubject =
  { type: SubjectType; from: string } | { type: 'self' } | { type: 'none' };

export type RecordedSubject =
  | { type: SubjectType; id: string }
  | { type: 'self'; id: string | null }
  | { type: 'none' }
  | { type: 'unknown' };
