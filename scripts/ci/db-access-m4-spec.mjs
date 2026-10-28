// Internal finite M4 kernel derivation. No runtime admission authority.
import ts from 'typescript';
import { allOf, literal } from './db-access-m4-syntax.mjs';

export const M4_KERNEL_FILE = 'apps/web/src/features/admin/claims/actions/ops-assignment.ts';

export const M4_KERNEL_PREMISES = Object.freeze([
  'caller owns tx: an open tenant transaction that commits only after normal return and rolls back on any throw',
  'caller authenticates the actor and admits actorId, actorRole and tenantId; the kernel verifies no user identity and is not A1 admission',
  'trusted imports are not derived: drizzle-orm (and, eq, isNull), @interdomestik/database/schema (claims, user, auditLog), withTenant, claimStatusFromLifecycleFields, isTerminalStatus, OpsDomainDenialError, nanoid and their module-load effects',
  'Drizzle 0.45.2 compiles each derived builder chain to one statement on tx; no executed SQL is claimed',
  'intrinsics (Date, Promise, Array, Object) are unmodified',
  'this source only: callers, other copies and every other executable use context remain separate obligations',
]);

export const DATABASE = '@interdomestik/database/schema';
export const OPERATORS = 'drizzle-orm';

export const TENANT_SECURITY = '@interdomestik/database/tenant-security';

export const CLAIM_LIFECYCLE = '@interdomestik/database/claim-lifecycle';

export const OUTCOME = './ops-action-outcome';

export const EXPORT = ts.SyntaxKind.ExportKeyword;

export const ASYNC = ts.SyntaxKind.AsyncKeyword;

export const IMPORTS = {
  [DATABASE]: {
    auditLog: false,
    claims: false,
    user: false,
  },
  [OPERATORS]: { and: false, eq: false, isNull: false },
  '@interdomestik/database': { TenantTransaction: true },
  [CLAIM_LIFECYCLE]: { claimStatusFromLifecycleFields: false },
  [TENANT_SECURITY]: { withTenant: false },
  nanoid: { nanoid: false },
  '../types': { isTerminalStatus: false },
  [OUTCOME]: { OpsDomainDenialError: false, OpsActionResult: true },
};

export const CONSTANTS = {
  ASSIGNMENT_TARGET_ROLE: { exported: true, value: 'staff' },
  ASSIGNMENT_TARGET_DENIED_ERROR: {
    exported: true,
    value: 'Staff member not found or out of scope',
  },
  ASSIGNMENT_CONFLICT_ERROR: { exported: true, value: 'Claim changed. Reload and try again.' },
  CLAIM_NOT_FOUND_ERROR: { exported: false, value: 'Claim not found or access denied' },
  TERMINAL_CLAIM_ERROR: { exported: false, value: 'Cannot perform assign on a terminal claim.' },
};

export const TYPE_ALIASES = {
  AssignClaimOwnerParams: {
    exported: true,
    type: '{ actorId: string; actorRole: string; claimId: string; staffId: string; tenantId: string }',
  },
  AssignmentGuardSnapshot: {
    exported: false,
    type: `Pick<typeof claims.$inferSelect, 'staffId' | 'caseLifecycleState' | 'recoveryLifecycleState'>`,
  },
};

export const FUNCTIONS = {
  buildAssignmentGuard: {
    modifiers: [],
    params: [['read', 'AssignmentGuardSnapshot', 'snapshot']],
    returns: null,
  },
  findAssignableStaff: {
    modifiers: [ASYNC],
    params: [
      ['tx', 'TenantTransaction', 'tx'],
      ['tenantId', 'string', 'param:tenantId'],
      ['staffId', 'string', 'param:staffId'],
    ],
    returns: 'Promise<{ id: string } | undefined>',
  },
  assignClaimOwnerInTransaction: {
    modifiers: [EXPORT, ASYNC],
    params: [
      ['tx', 'TenantTransaction', 'tx'],
      ['params', 'AssignClaimOwnerParams', 'params'],
    ],
    returns: 'Promise<OpsActionResult>',
  },
};

export const AND = `${OPERATORS}#and`;

export const EQ = `${OPERATORS}#eq`;

export const IS_NULL = `${OPERATORS}#isNull`;

export const WITH_TENANT = `${TENANT_SECURITY}#withTenant`;

export const LIFECYCLE_STATUS = `${CLAIM_LIFECYCLE}#claimStatusFromLifecycleFields`;

export const IS_TERMINAL = '../types#isTerminalStatus';

export const DENIAL = `${OUTCOME}#OpsDomainDenialError`;

export const NANOID = 'nanoid#nanoid';

export const GUARD_FUNCTION = 'function:buildAssignmentGuard';

export const TARGET_FUNCTION = 'function:findAssignableStaff';

export const TABLES = new Map([
  [`${DATABASE}#claims`, 'claims'],
  [`${DATABASE}#user`, 'user'],
  [`${DATABASE}#auditLog`, 'auditLog'],
]);

export const ROW_BINDINGS = ['snapshot', 'row:', 'rows:'];

export const CLAIM_SCOPE = [
  { eq: ['claims.id', 'param:claimId'] },
  { eq: ['claims.tenantId', 'param:tenantId'] },
];

export const CLAIM_COLUMNS = {
  staffId: 'claims.staffId',
  claimNumber: 'claims.claimNumber',
  caseLifecycleState: 'claims.caseLifecycleState',
  recoveryLifecycleState: 'claims.recoveryLifecycleState',
};

export const GUARD = allOf(
  { eqOrIsNull: ['claims.staffId', 'snapshot.staffId'] },
  { eq: ['claims.caseLifecycleState', 'snapshot.caseLifecycleState'] },
  { eq: ['claims.recoveryLifecycleState', 'snapshot.recoveryLifecycleState'] }
);

export const TARGET_ELIGIBILITY = allOf(
  { eq: ['user.id', 'param:staffId'] },
  { eq: ['user.role', literal(CONSTANTS.ASSIGNMENT_TARGET_ROLE.value)] }
);

export const ASSIGNMENT_SET = {
  staffId: 'param:staffId',
  assignedAt: 'clock:now',
  assignedById: 'param:actorId',
  updatedAt: 'clock:now',
};

export const ASSIGNMENT_RETURNING = {
  id: 'claims.id',
  staffId: 'claims.staffId',
  assignedAt: 'claims.assignedAt',
  assignedById: 'claims.assignedById',
};

export const AUDIT_VALUES = {
  id: 'generated:nanoid()',
  tenantId: 'param:tenantId',
  actorId: 'param:actorId',
  action: literal('assign_owner'),
  entityType: literal('claim'),
  entityId: 'param:claimId',
  metadata: {
    previousStaffId: 'row:claim.staffId',
    newStaffId: 'param:staffId',
    claimNumber: 'row:claim.claimNumber',
  },
  createdAt: 'clock:new Date()',
};

export const SUCCESS = { success: 'literal:true', data: 'rows:updated[0]' };
