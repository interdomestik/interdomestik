import ts from 'typescript';
import { isFunction, unwrap } from './db-access-source.mjs';
import { rootEnv, usesThis } from './db-access-invocation-values.mjs';

// Narrow adapter for a source-verified direct value import. It shares the resolver's private
// registry; it neither relaxes generic module lookup nor evaluates async factory returns.
export function importedInvocation(model, controls, call, callerContext) {
  const { references, frames, values, isMutated, isEscaped } = controls;
  if (!references || !call || !ts.isCallExpression(call)) return;
  const expression = unwrap(call.expression);
  if (!ts.isIdentifier(expression) || call.questionDotToken) return;
  const binding = model.rawDeclaration(expression);
  if (!binding || (!ts.isImportSpecifier(binding) && !ts.isImportClause(binding))) return;
  let statement = binding;
  while (statement && !ts.isImportDeclaration(statement)) statement = statement.parent;
  if (
    !statement ||
    !ts.isStringLiteral(statement.moduleSpecifier) ||
    statement.importClause?.isTypeOnly ||
    binding.isTypeOnly
  )
    return;
  const file = model.moduleFile(statement.moduleSpecifier.text, model.fileOf(expression));
  if (!file || !model.parsed.has(file)) return;
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
    return;
  const fail = reason => ({ functions: [], targets: [], unknown: true, reasons: [reason] });
  const holder = fn.parent;
  if (ts.isVariableDeclaration(holder) && !(ts.getCombinedNodeFlags(holder) & ts.NodeFlags.Const))
    return fail('mutable-import-export');
  if (
    isMutated(expression) ||
    isMutated(fn) ||
    (fn.name && isMutated(fn.name)) ||
    (ts.isVariableDeclaration(holder) && isMutated(holder.name)) ||
    isEscaped(fn)
  )
    return fail('mutated-or-escaped-import-export');
  if (usesThis(fn)) return fail('this-dependent');
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
