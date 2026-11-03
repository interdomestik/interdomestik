// Tenant guard stage helper: whether a reference to tenant state is an accepted form.

import ts from 'typescript';
import { originKey } from './modules.mjs';
import { hasFlag } from './rules-digest.mjs';
import { unitOf } from './syntax.mjs';

// A stage that does not apply to a use leaves it to the next stage.
const UNDECIDED = Symbol('undecided');

/**
 * Builds `stateUseProblem(fact, node, entry, note)`. Why a reference to tenant state is not an
 * accepted form, or null when it is. Refused from any code: a write (assignment, update, delete,
 * destructuring target), a call through a computed member that is not a literal, a known mutating
 * method, and an escape (stored, returned, aliased, passed to a callee whose closure changed).
 * Changed code may in addition call no method on the state at all unless a source-bound read-only
 * contract names that member path (Q3). Accepted: member reads, iteration, operators and
 * conditions, calls into unchanged closures, and, for reviewed schema values only, being handed
 * to a finite query-builder method (Q2). A function binding is refused only when it is reassigned.
 */
export function createStateUseProblem(ctx, stateCalleeProblem) {
  const env = {
    ctx,
    stateCalleeProblem,
    BUILDER_METHODS: ctx.BUILDER_METHODS,
    MUTATORS: ctx.MUTATORS,
    SCHEMA: ctx.SCHEMA,
    argumentCall: ctx.argumentCall,
    closureUnchanged: ctx.closureUnchanged,
    escapeContract: ctx.escapeContract,
    isWriteTarget: ctx.isWriteTarget,
    outermost: ctx.outermost,
    readContract: ctx.readContract,
    shallowPrimitive: ctx.shallowPrimitive,
    unwrap: ctx.unwrap,
    yieldsOperand: ctx.yieldsOperand,
  };
  return (fact, node, entry, note) => stateUseProblem(env, fact, node, entry, note);
}

function stateUseProblem(env, fact, node, entry, note) {
  const unit = unitOf(node);
  const changed = !unit || !fact.unchanged(unit);
  const use = { fact, entry, note, unit, changed, ...accessChain(env, node) };
  if (env.isWriteTarget(use.value))
    return refuseChangedElseNote(use, 'is written by changed code', use.value.parent);
  if (entry.kind === 'function') return null;
  const invoked = invocationProblem(env, use);
  if (invoked !== UNDECIDED) return invoked;
  use.schema = entry.kind === 'kernel' && env.SCHEMA.test(entry.origin.file);
  const handed = handedProblem(env, use);
  if (handed !== UNDECIDED) return handed;
  return readProblem(env, use);
}

/** The member path read off the reference, and the outermost value it ends in. */
function accessChain(env, node) {
  let value = env.outermost(node);
  const path = [];
  let member = false;
  let computed = false;
  while (
    (ts.isPropertyAccessExpression(value.parent) || ts.isElementAccessExpression(value.parent)) &&
    value.parent.expression === value
  ) {
    const access = value.parent;
    member = true;
    const key = accessKey(env, access);
    if (key === null) computed = true;
    else path.push(key);
    value = env.outermost(access);
  }
  return { value, parent: value.parent, path, member, computed };
}

function accessKey(env, access) {
  if (ts.isPropertyAccessExpression(access)) return access.name.text;
  const argument = env.unwrap(access.argumentExpression);
  return ts.isStringLiteralLike(argument) || ts.isNumericLiteral(argument) ? argument.text : null;
}

// Unchanged code that writes or mutates state keeps doing so; when what it writes depends on
// the unit's own parameters the unit is a writer, held to the legacy-sink caller rules.
function refuseChangedElseNote(use, problem, target) {
  if (use.changed) return problem;
  use.note.writer(use.fact, use.unit, target);
  return null;
}

function invocationProblem(env, use) {
  const { value, parent, member, computed, path, changed, entry } = use;
  const invoked =
    (ts.isCallExpression(parent) || ts.isTaggedTemplateExpression(parent)) &&
    (parent.expression ?? parent.tag) === value;
  if (!invoked) return UNDECIDED;
  if (!member)
    return env.closureUnchanged(entry.origin) ? null : 'is called while its closure changed';
  if (computed) return refuseChangedElseNote(use, 'is called through a computed member', parent);
  const method = path.at(-1);
  if (env.MUTATORS.has(method))
    return refuseChangedElseNote(use, `is mutated by changed code (${method})`, parent);
  if (changed && !env.readContract(entry.root ?? originKey(entry.origin), path.join('.'))) {
    return `is called by changed code (${path.join('.')}) without a read-only contract`;
  }
  return null;
}

function handedProblem(env, use) {
  const { value, parent, fact, unit, changed, member, schema } = use;
  const call = env.argumentCall(value);
  if (call) return argumentProblem(env, use, call);
  // A tagged template (Drizzle `sql`) keeps its interpolated values: its result is held too.
  if (schema && changed && ts.isTemplateSpan(parent)) {
    const tagged = parent.parent.parent;
    if (ts.isTaggedTemplateExpression(tagged)) return env.ctx.heldCallProblem(fact, unit, tagged);
  }
  if (schema && member && env.ctx.builderProjection(fact, value)) return null;
  if (
    ts.isSpreadElement(parent) &&
    (ts.isCallExpression(parent.parent) || ts.isNewExpression(parent.parent))
  ) {
    const problem = env.stateCalleeProblem(fact, unit, parent.parent.expression, changed);
    return problem ? `is spread into ${problem}` : null;
  }
  return UNDECIDED;
}

function argumentProblem(env, { fact, unit, changed, schema }, call) {
  const callee = env.unwrap(call.expression);
  if (
    schema &&
    ts.isPropertyAccessExpression(callee) &&
    env.BUILDER_METHODS.has(callee.name.text)
  ) {
    const receiver = env.ctx.receiverProblem(fact, callee.expression);
    return receiver ? `is handed to ${receiver}` : null;
  }
  const problem = env.stateCalleeProblem(fact, unit, call.expression, changed);
  if (problem) return `is passed to ${problem}`;
  return schema && changed ? env.ctx.heldCallProblem(fact, unit, call) : null;
}

function readProblem(env, use) {
  const { value, parent, fact, unit, changed, member, entry } = use;
  // A shallow copy or an iteration hands out the members themselves: from changed code only
  // when every member of the state is a primitive (a const literal of primitives).
  if (isCopyOrIteration(parent, value)) {
    return !changed || (!member && env.shallowPrimitive(entry.origin))
      ? null
      : 'is copied or iterated by changed code while its members are not primitives';
  }
  if (yieldsPrimitive(env, parent, value)) return null;
  if (member && !changed) return null; // a member read in unchanged code
  // `const ALIAS = state` at module scope: the alias is the same state, judged at its own uses.
  if (!member && isModuleConstAlias(fact, parent, value)) {
    use.note.alias({ file: fact.file, name: parent.name.text }, entry);
    return null;
  }
  if (env.escapeContract(entry.root ?? originKey(entry.origin), fact, unit)) return null;
  return `escapes (${parent?.getText(fact.sourceFile).slice(0, 60)})`;
}

function isCopyOrIteration(parent, value) {
  return (
    (ts.isForOfStatement(parent) && parent.expression === value) ||
    (ts.isSpreadElement(parent) && ts.isArrayLiteralExpression(parent.parent)) ||
    ts.isSpreadAssignment(parent)
  );
}

// Reads that yield a primitive: key iteration, operators whose result is not an operand,
// conditions, template text, computed keys. (`a ?? b`, `a || b`, `a && b` and `a, b` can
// yield the operand itself.)
function yieldsPrimitive(env, parent, value) {
  return (
    (ts.isForInStatement(parent) && parent.expression === value) ||
    (ts.isBinaryExpression(parent) &&
      !env.isWriteTarget(parent.left) &&
      !env.yieldsOperand(parent, value)) ||
    ts.isPrefixUnaryExpression(parent) ||
    ts.isTypeOfExpression(parent) ||
    ts.isTemplateSpan(parent) ||
    (ts.isElementAccessExpression(parent) && parent.argumentExpression === value) ||
    (ts.isConditionalExpression(parent) && parent.condition === value) ||
    ((ts.isIfStatement(parent) || ts.isWhileStatement(parent) || ts.isSwitchStatement(parent)) &&
      parent.expression === value)
  );
}

function isModuleConstAlias(fact, parent, value) {
  if (
    !ts.isVariableDeclaration(parent) ||
    parent.initializer !== value ||
    !ts.isIdentifier(parent.name)
  ) {
    return false;
  }
  const statement = parent.parent?.parent;
  return Boolean(
    statement &&
    ts.isVariableStatement(statement) &&
    statement.parent === fact.sourceFile &&
    hasFlag(parent.parent, ts.NodeFlags.Const)
  );
}
