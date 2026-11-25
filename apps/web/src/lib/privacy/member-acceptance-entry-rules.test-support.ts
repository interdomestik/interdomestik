import ts from 'typescript';
import { walkReferences } from './member-acceptance-ast.test-support';
import { takesAuthority, verifyReaderCalls } from './member-acceptance-page-readers.test-support';
import { lineOf, shortHash } from '../../../../../scripts/ci/server-mutation/ast.mjs';
import { cashResubmission } from './member-acceptance-entry-scope.test-support';
import {
  deferredReason,
  deferredUnits,
  descendants,
  guardModule,
  keyOf,
  web,
  type Declaration,
  type SourceUnit,
  type loadInventory,
} from './member-acceptance-inventory.test-support';

export type Entry = {
  disposition: string;
  via?: string;
  reason?: string;
  evidence?: string;
  proof?: string;
};

const fixedBy2113 = new Set([
  'actions/activities.core.ts#getLeadActivities',
  'actions/activities.core.ts#logActivity',
  'actions/branch-dashboard.ts#getBranchDashboard',
  'actions/leads/dashboard.ts#listLeadsAction',
  'lib/actions/agent.core.ts#logActivity',
]);

export type Registry = Readonly<Record<string, Entry>>;
type Inventory = ReturnType<typeof loadInventory>;
export function validateEntryCoverage(ids: string[], registry: Registry) {
  const discovered = new Set<string>();
  for (const id of ids) {
    if (discovered.has(id)) throw new Error(`Duplicate entry: ${id}`);
    discovered.add(id);
    if (!Object.hasOwn(registry, id)) throw new Error(`Missing disposition: ${id}`);
  }
  for (const id of Object.keys(registry)) {
    if (!discovered.has(id)) throw new Error(`Stale disposition: ${id}`);
  }
}

function fail(unit: SourceUnit, message: string): never {
  throw new Error(`${unit.id}: ${message}`);
}

function isWebServer(ref: Declaration) {
  return (
    ref.file.startsWith(web) &&
    !ref.decl
      .getSourceFile()
      .statements.some(
        statement =>
          ts.isExpressionStatement(statement) &&
          ts.isStringLiteral(statement.expression) &&
          statement.expression.text === 'use client'
      )
  );
}

function assertNoOtherSource(inventory: Inventory, unit: SourceUnit, closure: Declaration[]) {
  for (const ref of closure.filter(isWebServer)) {
    const sources = inventory.sourceImports(ref, ref === unit);
    if (sources.length)
      fail(unit, `other authority or session source in ${ref.file}: ${sources.join(', ')}`);
  }
}
function validateLoader(inventory: Inventory, unit: SourceUnit, ref: Declaration) {
  if (takesAuthority(inventory, ref.decl))
    fail(unit, `protected loader takes authority in ${ref.file}`);
  if (!inventory.hasCall(ref, guardModule, 'requireAdmittedMember'))
    fail(unit, `protected loader lacks requireAdmittedMember in ${ref.file}`);
}
function validateChecked(inventory: Inventory, unit: SourceUnit, via: string | undefined) {
  if (via === 'withMemberAcceptance' || via === 'memberGuarded') {
    if (
      via !== (unit.category === 'route' ? 'withMemberAcceptance' : 'memberGuarded') ||
      !inventory.directGuard(unit, via)
    )
      fail(unit, `expected direct ${via} export`);
    return;
  }

  if (!via) fail(unit, 'checked entry needs a guard or chokepoint');
  if (via === 'requireAdmittedMember') {
    assertNoOtherSource(inventory, unit, [unit]);
    validateLoader(inventory, unit, unit);
    verifyReaderCalls(inventory, unit, message => fail(unit, message));
    return;
  }

  if (via === 'requireMemberAcceptancePage' || via === 'static_render') {
    validatePage(inventory, unit, via);
    return;
  }

  const chokepoint = inventory.getExport(via);
  const checked = walkReferences(
    inventory,
    unit,
    ref => !isWebServer(ref) || ref.file === guardModule || keyOf(ref) === keyOf(chokepoint)
  );
  assertNoOtherSource(
    inventory,
    unit,
    checked.filter(ref => keyOf(ref) !== keyOf(chokepoint))
  );
  if (!checked.some(ref => keyOf(ref) === keyOf(chokepoint))) {
    fail(unit, `missing listed chokepoint ${via}`);
  }
}
function validatePage(inventory: Inventory, unit: SourceUnit, via: string) {
  if (unit.category !== 'page') fail(unit, 'page disposition on a non-page export');
  const freeStart = `${web}actions/free-start-drafts/session.core.ts`;
  const closure = walkReferences(
    {
      references: ref => {
        assertNoOtherSource(inventory, unit, [ref]);
        return inventory.references(ref);
      },
    },
    unit,
    ref => !isWebServer(ref) || ref.file === guardModule || ref.file === freeStart
  ).filter(ref => isWebServer(ref) && ref.file !== guardModule);

  const admits = closure.some(
    ref =>
      ref.file === freeStart ||
      inventory.hasCall(ref, guardModule, 'requireAdmittedMember') ||
      inventory.hasCall(ref, guardModule, 'requireMemberAcceptancePage')
  );
  const loaders = new Set<string>();
  for (const ref of closure.filter(ref => ref.file !== freeStart)) {
    const readers = verifyReaderCalls(inventory, ref, message => fail(unit, message));
    if (
      inventory.hasCall(ref, guardModule, 'requireAdmittedMember') ||
      (readers.length && ref !== unit)
    ) {
      validateLoader(inventory, unit, ref);
    }
    if (readers.length && ref !== unit) loaders.add(keyOf(ref));
    if (via === 'static_render' && readers.length) {
      fail(unit, `static page reaches a protected reader in ${ref.file}`);
    }
  }
  for (const ref of closure) {
    inventory.readerCalls(
      ref,
      target => target.file !== ref.file && loaders.has(keyOf(target)),
      'loader'
    );
  }
  if ((via === 'requireMemberAcceptancePage') !== admits) {
    fail(unit, `expected ${via} construction`);
  }
}

export function roleEvidenceProof(inventory: Inventory, unit: SourceUnit, evidence: string) {
  const separator = evidence.lastIndexOf(':');
  const file = evidence.slice(0, separator);
  const line = Number(evidence.slice(separator + 1));
  const path = findRolePath(inventory, unit, file, line);
  if (!path) fail(unit, `unresolved role denial at ${evidence}`);
  // A moved check, an earlier read, or changed branch on the reviewed call chain needs review.
  const proof = path.map(ref => ref.decl.getText());
  if (file === 'packages/domain-activities/src/log-member.ts') {
    const predicates = walkReferences(
      inventory,
      path.at(-1)!,
      ref => ref.file !== file && ref.file !== 'packages/domain-activities/src/access.ts'
    ).filter(
      ref =>
        ref.file.endsWith('/access.ts') &&
        ts.isFunctionDeclaration(ref.decl) &&
        ['memberActivityWriteScope', 'memberActivityReadScope', 'isMemberSelfRole'].includes(
          ref.decl.name?.text ?? ''
        )
    );
    if (predicates.length !== 3)
      fail(unit, 'activity role decision does not reach both raw-role checks');
    proof.push(...predicates.map(ref => ref.decl.getText()));
  }
  if (file === 'packages/domain-activities/src/member-notes/result.ts') {
    const scope = inventory
      .references(path.at(-1)!)
      .find(
        ref =>
          ref.file === 'packages/domain-activities/src/member-notes/access.ts' &&
          ts.isFunctionDeclaration(ref.decl) &&
          ref.decl.name?.text === 'memberNoteScope'
      );
    if (!scope) fail(unit, 'member note denial does not reach the role allowlist');
    proof.push(scope.decl.getText());
  }
  return shortHash(proof.join('\n'));
}

function findRolePath(inventory: Inventory, unit: SourceUnit, file: string, line: number) {
  const queue = [[unit as Declaration]];
  const seen = new Set<string>();
  for (const chain of queue) {
    const ref = chain.at(-1)!;
    const key = keyOf(ref);
    if (seen.has(key)) continue;
    seen.add(key);
    if (
      ref.file === file &&
      descendants(ref.decl).some(node => lineOf(node) === line && isDenial(node, ref))
    ) {
      return chain;
    }
    if (ref.file === guardModule || ref.file.startsWith('packages/database/src/')) continue;
    for (const next of inventory.references(ref)) queue.push([...chain, next]);
  }
  return undefined;
}
function isDenial(node: ts.Node, ref: Declaration) {
  if (ref.file === 'packages/domain-activities/src/log-member.ts') {
    if (!ts.isVariableStatement(node) || !ts.isBlock(node.parent)) return false;
    const [scope] = node.declarationList.declarations;
    const denial = node.parent.statements[node.parent.statements.indexOf(node) + 1];
    return (
      scope.name.getText() === 'scope' &&
      scope.initializer?.getText() === 'memberActivityWriteScope(actor.role)' &&
      denial !== undefined &&
      ts.isIfStatement(denial) &&
      denial.expression.getText() === "scope === 'denied'" &&
      descendants(denial.thenStatement).some(child => ts.isReturnStatement(child))
    );
  }
  if (ts.isThrowStatement(node)) return true;
  if (ts.isIfStatement(node)) {
    return descendants(node.thenStatement).some(
      child => ts.isReturnStatement(child) || ts.isThrowStatement(child)
    );
  }
  if (!ts.isCallExpression(node)) return false;
  return /(?:require|assert|authorize|[Aa]dmission|[Aa]ccess|[Ss]cope|defineAction|defineFormAction|verify|Guard)/u.test(
    node.expression.getText()
  );
}
function validateRoleDisposition(inventory: Inventory, unit: SourceUnit, row: Entry) {
  if (row.disposition === 'defect_fixed_elsewhere' && !fixedBy2113.has(unit.id)) {
    fail(unit, 'entry was outside the #2113 role fix');
  }
  if (!row.evidence) fail(unit, 'role denial needs a file and line');
  const proof = roleEvidenceProof(inventory, unit, row.evidence);
  if (proof !== row.proof) {
    fail(unit, `reviewed role denial changed at ${row.evidence} (current proof ${proof})`);
  }
}

export function validateEntry(inventory: Inventory, unit: SourceUnit, row: Entry) {
  switch (row.disposition) {
    case 'checked':
      validateChecked(inventory, unit, row.via);
      return;
    case 'not_member_reachable':
    case 'defect_fixed_elsewhere':
      validateRoleDisposition(inventory, unit, row);
      return;
    case 'exempt':
      if (!row.reason?.trim()) fail(unit, 'exempt entry needs a reason');
      if (row.via) validateChecked(inventory, unit, row.via);
      return;
    case 'deferred_13a2':
      if (!deferredUnits.includes(unit.id) || row.reason !== deferredReason) {
        fail(unit, 'unexpected 13a-2 deferral');
      }
      return;
    case 'defect_reported':
      if (unit.id !== cashResubmission || !row.reason?.trim() || !row.evidence) {
        fail(unit, 'reported defect must be listed with an evidence location and reason');
      }
      validateChecked(inventory, unit, row.via);
      return;
    default:
      fail(unit, `unknown disposition ${row.disposition}`);
  }
}
