import {
  fail,
  same,
  named,
  parameters,
  columns,
} from './db-access-m4-assignment-primitive-ast.mjs';
import { validateAssignmentOperatorLaws } from './db-access-m4-assignment-operator-semantics.mjs';
// Fixed T2 assignment primitive laws; no generic ORM/receiver admission.
import ts from 'typescript';
import { createHash } from 'node:crypto';
import { ASSIGNMENT_PRIMITIVES } from './db-access-m4-assignment-primitive-contract.mjs';
const hash = text => createHash('sha256').update(text).digest('hex');
export function deriveAssignmentPrimitiveSemantics(contract) {
  if (
    contract.version !== 1 ||
    contract.class !== 'fixed-direct-assignment-builders' ||
    contract.drizzleVersion !== '0.45.2'
  )
    fail('class');
  const units = new Map();
  for (const [file, record] of Object.entries(contract.files)) {
    if (hash(record.source) !== record.sha256 || Buffer.byteLength(record.source) !== record.bytes)
      fail('source bytes');
    const unit = ts.createSourceFile(
      file,
      record.source,
      ts.ScriptTarget.Latest,
      true,
      file.endsWith('.ts') ? ts.ScriptKind.TS : ts.ScriptKind.JS
    );
    if (unit.parseDiagnostics.length) fail('source parse');
    units.set(file, unit);
  }
  validateAssignmentOperatorLaws(units);
  const tenant = units.get('packages/database/src/tenant-security.ts');
  parameters(
    named(tenant, 'withTenant'),
    tenant,
    '(tenantId: string,tenantColumn: PgColumn | unknown,userConditions?: SQL | undefined)',
    'withTenant'
  );
  same(
    named(tenant, 'withTenant').body.getText(tenant),
    '{if(!tenantColumn||typeof tenantColumn!=="object"){throw new Error("Invalid tenant column provided to withTenant");}const tenantCheck=eq(tenantColumn as PgColumn,tenantId);return userConditions?and(tenantCheck,userConditions)!:tenantCheck;}',
    'tenant conjunction'
  );
  const lifecycle = units.get('packages/database/src/claim-lifecycle.ts'),
    fn = named(lifecycle, 'claimStatusFromLifecycleFields'),
    choice = fn.body.statements[1],
    states = {};
  parameters(
    fn,
    lifecycle,
    '(input: { caseLifecycleState: ClaimCaseLifecycleState | string | null | undefined; recoveryLifecycleState: ClaimRecoveryLifecycleState | string | null | undefined; })',
    'lifecycle'
  );
  if (
    fn.body.statements.length !== 2 ||
    !ts.isSwitchStatement(choice) ||
    choice.expression.getText(lifecycle) !== 'pair'
  )
    fail('lifecycle switch');
  // Match the actual nullish pair construction, not a precomputed status label.
  const declaration = fn.body.statements[0].declarationList?.declarations[0];
  const pair = declaration?.initializer;
  if (
    declaration?.name.getText(lifecycle) !== 'pair' ||
    !ts.isTemplateExpression(pair) ||
    pair.templateSpans.length !== 2 ||
    pair.head.text !== '' ||
    pair.templateSpans[0].literal.text !== ':' ||
    pair.templateSpans[1].literal.text !== ''
  )
    fail('lifecycle pair');
  same(
    pair.templateSpans[0].expression.getText(lifecycle),
    "input.caseLifecycleState ?? ''",
    'case input'
  );
  same(
    pair.templateSpans[1].expression.getText(lifecycle),
    "input.recoveryLifecycleState ?? ''",
    'recovery input'
  );
  for (const clause of choice.caseBlock.clauses) {
    if (
      ts.isCaseClause(clause) &&
      ts.isStringLiteral(clause.expression) &&
      clause.statements.length === 1 &&
      ts.isReturnStatement(clause.statements[0]) &&
      ts.isStringLiteral(clause.statements[0].expression)
    )
      states[clause.expression.text] = clause.statements[0].expression.text;
    else if (
      ts.isDefaultClause(clause) &&
      clause.statements.length === 1 &&
      ts.isThrowStatement(clause.statements[0])
    ) {
    } else fail('lifecycle branch');
  }
  const expected = {
    'draft:not_started': 'draft',
    'submitted:not_started': 'submitted',
    'recovery:submitted_to_airline': 'submitted_to_airline',
    'verification:not_started': 'verification',
    'evaluation:not_started': 'evaluation',
    'recovery:negotiation': 'negotiation',
    'recovery:court': 'court',
    'resolved:resolved': 'resolved',
    'rejected:closed': 'rejected',
  };
  if (JSON.stringify(states) !== JSON.stringify(expected)) fail('lifecycle states');
  const terminal = units.get('apps/web/src/features/admin/claims/types.ts');
  same(
    named(terminal, 'TERMINAL_STATUSES').getText(terminal),
    '["resolved","rejected"]',
    'terminal set'
  );
  parameters(named(terminal, 'isTerminalStatus'), terminal, '(status: ClaimStatus)', 'terminal');
  same(
    named(terminal, 'isTerminalStatus').body.getText(terminal),
    '{return TERMINAL_STATUSES.includes(status);}',
    'terminal membership'
  );
  const permission = units.get('packages/shared-auth/src/permissions.ts');
  let roles = named(permission, 'ROLES');
  while (ts.isAsExpression(roles)) roles = roles.expression;
  if (!ts.isObjectLiteralExpression(roles)) fail('role object literal');
  same(
    roles.getText(permission),
    `{
    super_admin: 'super_admin',
    admin: 'admin',
    tenant_admin: 'tenant_admin',
    global_support: 'global_support',
    auditor: 'auditor',
    branch_manager: 'branch_manager',
    staff: 'staff',
    agent: 'agent',
    member: 'member',
  }`,
    'complete role object literal'
  );
  for (const name of ['isSuperAdmin', 'isTenantAdmin'])
    parameters(named(permission, name), permission, '(role: string | null | undefined)', name);
  same(
    named(permission, 'isSuperAdmin').body.getText(permission),
    '{return role===ROLES.super_admin;}',
    'super role'
  );
  same(
    named(permission, 'isTenantAdmin').body.getText(permission),
    '{return role===ROLES.admin||role===ROLES.tenant_admin;}',
    'tenant admin role'
  );
  const denial = units.get('apps/web/src/features/admin/claims/actions/ops-action-outcome.ts'),
    ctor = named(denial, 'OpsDomainDenialError').members.find(ts.isConstructorDeclaration);
  parameters(ctor, denial, '(message: string)', 'denial constructor');
  same(
    ctor.body.getText(denial),
    '{super(SAFE_DOMAIN_DENIALS.has(message)?message:OPS_ACTION_FAILED_ERROR);this.name="OpsDomainDenialError";}',
    'denial class'
  );
  const tables = [
    columns(units.get('packages/database/src/schema/claim-core.ts'), 'claims', 'claim', {
      id: 'id',
      tenantId: 'tenant_id',
      claimNumber: 'claim_number',
      title: 'title',
      branchId: 'branch_id',
      staffId: 'staffId',
      assignedAt: 'assignedAt',
      assignedById: 'assignedById',
      updatedAt: 'updatedAt',
      caseLifecycleState: 'case_lifecycle_state',
      recoveryLifecycleState: 'recovery_lifecycle_state',
    }),
    columns(units.get('packages/database/src/schema/auth.ts'), 'user', 'user', {
      id: 'id',
      tenantId: 'tenant_id',
      role: 'role',
      branchId: 'branch_id',
    }),
    columns(units.get('packages/database/src/schema/notes.ts'), 'auditLog', 'audit_log', {
      id: 'id',
      tenantId: 'tenant_id',
      actorId: 'actor_id',
      actorRole: 'actor_role',
      action: 'action',
      entityType: 'entity_type',
      entityId: 'entity_id',
      metadata: 'metadata',
      createdAt: 'created_at',
    }),
  ];
  return {
    version: 1,
    class: 'fixed-direct-assignment-builders',
    operators: ['eq', 'and', 'isNull', 'or'],
    scalarParameterLaw: true,
    actualDataTransactionCallbackLaw: true,
    nanoidScalarIdLaw: true,
    tenantConjunctionLaw: true,
    lifecycleStates: states,
    terminalStatuses: ['resolved', 'rejected'],
    tables,
  };
}
export function qualifyAssignmentPrimitiveBindings(imageRecords, runtimeContract) {
  const facts = deriveAssignmentPrimitiveSemantics(ASSIGNMENT_PRIMITIVES),
    bindings = [];
  for (const [file, link] of Object.entries(ASSIGNMENT_PRIMITIVES.rootLinks))
    if (imageRecords[file]?.link !== link) fail('actual package root ' + file);
  for (const [file, expected] of Object.entries(ASSIGNMENT_PRIMITIVES.files)) {
    const imageFile = ASSIGNMENT_PRIMITIVES.installedPaths[file] ?? file;
    const actual = imageRecords[imageFile];
    if (!actual || actual.sha256 !== expected.sha256 || actual.bytes !== expected.bytes)
      fail('executed image ' + file);
    if (
      !file.startsWith('node_modules/') &&
      runtimeContract.files[file]?.sha256 !== expected.sha256
    )
      fail('copied primitive ' + file);
    bindings.push({ file, imageFile, sha256: expected.sha256 });
  }
  return {
    facts,
    bindings,
    scope:
      'fixed scalar assignment builders under existing canonical-tx installed-image assumptions',
    assumptions: [
      'pinned Drizzle/Postgres/Node canonical transaction and scalar parameter implementation',
      'no hostile same-process intrinsic mutation in the closed private owner path',
    ],
    generalCompilerQualified: false,
    productionTLSQualified: false,
    nativeAdmission: false,
  };
}
