import ts from 'typescript';
import { isFunction, unwrap } from './db-access-source.mjs';
import { rootEnv, usesThis } from './db-access-invocation-values.mjs';

function importStatement(binding) {
  let statement = binding;
  while (statement && !ts.isImportDeclaration(statement)) statement = statement.parent;
  return statement;
}

// A value import specifier/clause of a parsed source module, or undefined.
function importSource(model, expression) {
  const binding = model.rawDeclaration(expression);
  if (!binding || (!ts.isImportSpecifier(binding) && !ts.isImportClause(binding))) return undefined;
  const statement = importStatement(binding);
  if (
    !statement ||
    !ts.isStringLiteral(statement.moduleSpecifier) ||
    statement.importClause?.isTypeOnly ||
    binding.isTypeOnly
  )
    return undefined;
  const file = model.moduleFile(statement.moduleSpecifier.text, model.fileOf(expression));
  if (!file || !model.parsed.has(file)) return undefined;
  return { binding, file };
}

// The single exported source function the imported reference resolves to, or undefined.
function exportedFunction(model, references, expression, { binding, file }) {
  const name = ts.isImportClause(binding) ? 'default' : (binding.propertyName ?? binding.name).text;
  const exported = model.exportDeclaration(file, name);
  const fn = model.declaration(expression);
  const reference = references(expression);
  if (
    !isFunction(fn) ||
    exported !== fn ||
    reference.unknown ||
    reference.functions.length !== 1 ||
    reference.functions[0] !== fn ||
    ![...model.parsed.values()].includes(fn.getSourceFile())
  )
    return undefined;
  return fn;
}

// undefined means this is not a direct source import, so the generic resolver result stands.
function resolveImportedFunction(model, references, call) {
  if (!references || !call || !ts.isCallExpression(call)) return undefined;
  const expression = unwrap(call.expression);
  if (!ts.isIdentifier(expression) || call.questionDotToken) return undefined;
  const source = importSource(model, expression);
  const fn = source && exportedFunction(model, references, expression, source);
  return fn ? { expression, fn } : undefined;
}

// Fail-closed reasons in their original order; undefined means the import may be invoked.
function importFailure({ isMutated, isEscaped }, expression, fn) {
  const holder = fn.parent;
  if (
    ts.isVariableDeclaration(holder) &&
    (ts.getCombinedNodeFlags(holder) & ts.NodeFlags.Const) === 0
  )
    return 'mutable-import-export';
  if (
    isMutated(expression) ||
    isMutated(fn) ||
    (fn.name && isMutated(fn.name)) ||
    (ts.isVariableDeclaration(holder) && isMutated(holder.name)) ||
    isEscaped(fn)
  )
    return 'mutated-or-escaped-import-export';
  if (usesThis(fn)) return 'this-dependent';
  return undefined;
}

// Narrow adapter for a source-verified direct value import. It shares the resolver's private
// registry; it neither relaxes generic module lookup nor evaluates async factory returns.
export function importedInvocation(model, controls, call, callerContext) {
  const { references, frames, values } = controls;
  const imported = resolveImportedFunction(model, references, call);
  if (!imported) return undefined;
  const { fn } = imported;
  const fail = reason => ({ functions: [], targets: [], unknown: true, reasons: [reason] });
  const failure = importFailure(controls, imported.expression, fn);
  if (failure) return fail(failure);
  const env = callerContext === undefined ? rootEnv(call) : frames.lookup(callerContext, call);
  if (!env) return fail('invalid-caller-context');
  const ctx = values.context();
  const bindings = values.bindArguments(ctx, fn, call);
  if (ctx.reasons.length) return fail(ctx.reasons.join('|'));
  const { descriptor } = frames.register(
    { node: fn, env: rootEnv(fn) },
    call,
    env,
    bindings,
    ctx.running
  );
  return {
    functions: [fn],
    targets: [{ ...descriptor, receiverNode: undefined, resolutionInvocations: [] }],
    unknown: false,
    reasons: [],
  };
}
