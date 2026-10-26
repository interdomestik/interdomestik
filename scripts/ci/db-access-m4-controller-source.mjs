// Finite source/control premise only. Neither source hashes nor this result grant admission.
import ts from 'typescript';
import { createHash } from 'node:crypto';
import { readRuntimeModule, runtimeTree, reject } from './db-access-m4-controller-ast.mjs';

export const M4_CONTROLLER_FILE = 'apps/web/src/server/operations/m4-ops-controller.ts';
export const M4_PROTOCOL_FILE = 'apps/web/src/server/operations/m4-assignment-protocol.ts';
const digest = text => createHash('sha256').update(text).digest('hex');
const freeze = value => {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
};
// These executable clauses are the finite accepted grammar, not candidate-provided assertions.
// AST construction preserves operands, order, await, catches, receivers, exact data fields,
// and all executable statements. Only erased types, layout and local binding names are omitted.
const CONTROLLER_CONTRACT =
  `
import * as schema from '@interdomestik/database/schema';
import { isSuperAdmin, isTenantAdmin } from '@interdomestik/shared-auth';
import { and, eq, sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { createHash } from 'node:crypto';
import { assignClaimOwnerInTransaction } from '../../features/admin/claims/actions/ops-assignment';
import { OpsDomainDenialError } from '../../features/admin/claims/actions/ops-action-outcome';
import type { CurrentOperationPrincipal } from '../../lib/auth/current-store-session';
import { parseM4AssignmentRequest } from './m4-assignment-protocol';
function successResult(value, claimId, staffId) {
  if (!value || typeof value !== 'object') throw new Error('Invalid operation result');
  const row = value;
  if (row.success !== true || !row.data || typeof row.data !== 'object') throw new Error('Invalid operation result');
  const data = row.data;
  const assignedAt = data.assignedAt instanceof Date ? data.assignedAt.toISOString() : data.assignedAt;
  if (data.id !== claimId || data.staffId !== staffId || typeof assignedAt !== 'string' || !Number.isFinite(Date.parse(assignedAt))) throw new Error('Invalid operation result');
  return { success: true, data: { id: data.id, staffId: data.staffId, assignedAt } };
}
function storedResult(value, claimId, staffId) {
  if (value && typeof value === 'object') {
    const row = value;
    if (row.success === false && typeof row.error === 'string' && row.error.length > 0 && row.error.length <= 512) return {success: false, error: row.error};
  }
  return successResult(value, claimId, staffId);
}
export function createM4OpsAssignmentController(configuration) {
  const {database, verifySession} = configuration;
  return async function execute(cookie, serialized) {
    const request = parseM4AssignmentRequest(serialized);
    if (!request || request.command !== 'm4.ops.assign-owner') return {status: 'denied', reason: 'INVALID_REQUEST'};
    try {
      return await database.transaction(async tx => {
        const principal = await verifySession(cookie);
        if (!principal) return {status: 'denied', reason: 'UNAUTHORIZED'};
        await tx.execute(sql` +
  '`select 1 / case when exists ( select 1 from pg_catalog.pg_roles where rolname=session_user and not rolsuper and not rolbypassrls ) and session_user=current_user then 1 else 0 end as restricted_role`' +
  `);
        await tx.execute(sql` +
  '`set local row_security = on`' +
  `);
        await tx.execute(sql` +
  "`select set_config('app.current_tenant_id', ${principal.tenantId}, true), set_config('app.current_access_tenant_id', ${principal.accessTenantId}, true)`" +
  `);
        const [actor] = await tx.select({id:schema.user.id,role:schema.user.role}).from(schema.user).where(and(eq(schema.user.id,principal.actorId),eq(schema.user.tenantId,principal.tenantId))).limit(1).for('share');
        if (!actor || !(isTenantAdmin(actor.role) || isSuperAdmin(actor.role))) return {status:'denied',reason:'UNAUTHORIZED'};
        await tx.execute(sql` +
  "`select set_config('app.user_role', ${actor.role}, true)`" +
  `);
        const staffId = request.staffId.trim();
        const [claim] = await tx.select({id:schema.claims.id}).from(schema.claims).where(and(eq(schema.claims.id,request.claimId),eq(schema.claims.tenantId,principal.accessTenantId))).limit(1).for('update');
        if (!claim) return {status:'denied',reason:'RESOURCE_DENIED'};
        await tx.execute(sql` +
  '`select pg_advisory_xact_lock(hashtextextended(${request.operationId}, 0))`' +
  `);
        const fingerprint = createHash('sha256').update(JSON.stringify([request.version,request.command,actor.id,principal.accessTenantId,request.claimId,staffId])).digest('hex');
        const [previous] = await tx.select().from(schema.operationResults).where(eq(schema.operationResults.operationId,request.operationId)).limit(1);
        if (previous) {
          if (previous.actorId !== actor.id || previous.tenantId !== principal.accessTenantId || previous.command !== request.command || previous.version !== request.version || previous.claimId !== request.claimId || previous.requestFingerprint !== fingerprint) return {status:'denied',reason:'OPERATION_CONFLICT'};
          return {status:'completed',operationId:request.operationId,replayed:true,result:storedResult(previous.response,request.claimId,staffId)};
        }
        let result;
        try {
          const assigned = !staffId || staffId === actor.id ? {success:false,error:'Staff member not found or out of scope'} : await assignClaimOwnerInTransaction(tx,{actorId:actor.id,actorRole:actor.role,tenantId:principal.accessTenantId,claimId:request.claimId,staffId});
          result = assigned.success ? successResult(assigned,request.claimId,staffId) : assigned;
        } catch(error) {
          if (!(error instanceof OpsDomainDenialError)) throw error;
          result = {success:false,error:error.message};
        }
        await tx.insert(schema.operationResults).values({operationId:request.operationId,tenantId:principal.accessTenantId,actorId:actor.id,claimId:request.claimId,command:request.command,version:request.version,requestFingerprint:fingerprint,response:result});
        return {status:'completed',operationId:request.operationId,replayed:false,result};
      });
    } catch {
      return {status:'indeterminate',operationId:request.operationId};
    }
  };
}
`;
const PROTOCOL_CONTRACT = String.raw`
const FIELDS = new Set(['version','command','operationId','claimId','staffId']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
function id(value) { return typeof value === 'string' && value.length > 0 && value.length <= 256 && !/[\u0000-\u001f\u007f]/.test(value); }
export function parseM4AssignmentRequest(serialized) {
  if (typeof serialized !== 'string' || new TextEncoder().encode(serialized).length > 8192) return null;
  try {
    const value = JSON.parse(serialized);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const row = value;
    if (Object.keys(row).some(key => !FIELDS.has(key)) || row.version !== 1 || !id(row.claimId) || typeof row.operationId !== 'string' || !UUID.test(row.operationId)) return null;
    if (row.command !== 'm4.ops.assign-owner' && row.command !== 'm4.legacy.assign-claim' && row.command !== 'm4.staff.assign-claim') return null;
    if (row.command === 'm4.ops.assign-owner' && !id(row.staffId)) return null;
    if (row.command === 'm4.legacy.assign-claim' && row.staffId !== null && !id(row.staffId)) return null;
    if (row.command === 'm4.staff.assign-claim' && row.staffId !== undefined && row.staffId !== null && !id(row.staffId)) return null;
    return Object.freeze({version:1,command:row.command,operationId:row.operationId,claimId:row.claimId,...(row.staffId === undefined ? {} : {staffId:row.staffId})});
  } catch { return null; }
}
`;

const equivalent = (actual, expected, label) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) reject(label);
};
function construct(text, contract, file) {
  const actual = readRuntimeModule(text, file),
    expected = readRuntimeModule(contract, file);
  equivalent(actual.imports, expected.imports, file + ': imports');
  equivalent([...actual.functions.keys()], [...expected.functions.keys()], file + ': functions');
  equivalent([...actual.constants.keys()], [...expected.constants.keys()], file + ': constants');
  const constants = {},
    functions = {},
    observed = new WeakMap();
  for (const [name, node] of actual.constants) {
    constants[name] = runtimeTree(node, actual);
    equivalent(
      constants[name],
      runtimeTree(expected.constants.get(name), expected),
      file + ': constant ' + name
    );
  }
  for (const [name, node] of actual.functions) {
    functions[name] = runtimeTree(node, actual, true, observed);
    equivalent(
      functions[name],
      runtimeTree(expected.functions.get(name), expected, true),
      file + ': control/effect ' + name
    );
  }
  return {
    actual,
    observed,
    derivation: { imports: actual.imports, constants, functions },
  };
}
function controllerClauses(controller) {
  const factory = controller.actual.functions.get('createM4OpsAssignmentController');
  const callbacks = [];
  function visit(node) {
    if (ts.isArrowFunction(node) && ts.isBlock(node.body)) callbacks.push(node);
    ts.forEachChild(node, visit);
  }
  visit(factory);
  if (callbacks.length !== 1) reject('owned callback shape');
  const [callback] = callbacks;
  const names = [
    'current-session-admission',
    'deny-no-session',
    'restricted-effective-login',
    'enable-local-rls',
    'set-local-tenant-context',
    'lock-current-actor',
    'deny-current-role',
    'set-current-role-context',
    'normalize-target',
    'lock-current-resource',
    'deny-resource',
    'lock-operation-identity',
    'derive-six-field-fingerprint',
    'read-operation-result',
    'validate-conflict-and-replay',
    'declare-result',
    'execute-kernel-or-domain-denial',
    'insert-every-completed-result',
    'return-completed',
  ];
  if (callback.body.statements.length !== names.length) reject('controller clause cardinality');
  return names.map((step, index) => ({
    step,
    tree: controller.observed.get(callback.body.statements[index]),
  }));
}
function callNodes(source, file) {
  const nodes = [];
  function visit(node) {
    if (
      ts.isCallExpression(node) ||
      ts.isTaggedTemplateExpression(node) ||
      ts.isNewExpression(node)
    ) {
      const start = node.getStart(source),
        end = node.getEnd();
      nodes.push({
        file,
        start,
        end,
        line: source.getLineAndCharacterOfPosition(start).line + 1,
        kind: ts.SyntaxKind[node.kind],
        expressionSha256: digest(source.text.slice(start, end)),
      });
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return nodes;
}
export function deriveM4OpsController({ controllerSource, protocolSource }) {
  const controller = construct(controllerSource, CONTROLLER_CONTRACT, M4_CONTROLLER_FILE);
  const protocol = construct(protocolSource, PROTOCOL_CONTRACT, M4_PROTOCOL_FILE);
  const facts = {
    controller: controller.derivation,
    protocol: protocol.derivation,
    clauses: controllerClauses(controller),
  };
  return freeze({
    version: 1,
    controllerPremiseOnly: true,
    runtimeAdmission: false,
    sourceSha256: {
      [M4_CONTROLLER_FILE]: digest(controllerSource),
      [M4_PROTOCOL_FILE]: digest(protocolSource),
    },
    facts,
    factsSha256: digest(JSON.stringify(facts)),
    sourceNodes: [
      ...callNodes(controller.actual.source, M4_CONTROLLER_FILE),
      ...callNodes(protocol.actual.source, M4_PROTOCOL_FILE),
    ],
    guarantees: [
      'owned callback admits session before business SQL statements',
      'current actor/home tenant and allowed role under FOR SHARE',
      'access-tenant claim under FOR UPDATE before replay',
      'six-field request fingerprint and six-field stored-row conflict gate',
      'kernel gets only current actor and admitted resource values',
      'every newly completed result is inserted on the same tx',
      'only domain denials become completed failures; unexpected failures escape the callback',
      'outer unexpected failure reports indeterminate with unchanged operationId; no automatic retry',
    ],
    premises: [
      'The private bootstrap must actually supply the verified A1 current-store verifier and a restricted purpose database; injectable configuration alone proves neither.',
      'A1 provider, kernel, schema, operators, crypto and every import/initializer/vendor/loader closure require their own authenticated source and runtime derivations.',
      'Transaction ownership/commit/rollback, SQL compilation, RLS/nonownership/no privilege recovery, driver lifetime, bounded operation deadlines and actual atomicity/concurrency/idempotency require executed proof.',
      'Builtins and intrinsics are unmodified in the qualified image; this source check does not establish runtime isolation.',
      'All actual execution contexts, mounted ingress/workload authority, source/effect lineage, raw identity/diagnostic multiplicities and protected producer/source/policy/event bindings remain required.',
      'This finite grammar covers ops assignment only; legacy/staff command parsing is not controller support or full M4/S8 admission.',
    ],
  });
}
