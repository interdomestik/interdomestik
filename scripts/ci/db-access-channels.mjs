import ts from 'typescript';
import { canonicalQueryChain } from './db-access-inventory.mjs';
import {
  environmentStringMethod,
  externalValue,
  trustedSchemaChain,
  trustedSchemaSqlValue,
} from './db-access-external.mjs';
import { unwrap } from './db-access-source.mjs';

// Only used for an unresolved member, after canonical/query/known DSL boundaries are checked.
// A locally resolved factory root does not resolve the member of its opaque return value.
export function unsupportedReceiver(model, raw) {
  let node = unwrap(raw);
  while (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node))
    node = unwrap(node.expression);
  const declaration = model.declaration(node);
  if (declaration)
    return (
      ts.isParameter(declaration) ||
      ts.isVariableDeclaration(declaration) ||
      ts.isBindingElement(declaration)
    );
  return ts.isCallExpression(node) || ts.isAwaitExpression(node) || ts.isYieldExpression(node);
}

export function handleArguments(provenance, args, opaque, origin, incomplete) {
  for (const arg of args) {
    const handle = provenance.tenantHandle(arg);
    if (handle === true || (opaque && handle === 'unknown'))
      incomplete.push({
        file: origin,
        reason:
          handle === true
            ? 'tenant transaction handle passed to unresolved callee'
            : 'unsupported mutated or bounded handle argument to unresolved callee',
      });
  }
}

export function inspectCallChannels(
  model,
  provenance,
  callee,
  args,
  invocation,
  origin,
  incomplete
) {
  const supported =
    canonicalQueryChain(callee, provenance) ||
    externalValue(model, callee, provenance) ||
    trustedSchemaChain(model, provenance, callee);
  handleArguments(
    provenance,
    args,
    !supported && !model.isQueryOperator(callee),
    origin,
    incomplete
  );
  if (
    ts.isPropertyAccessExpression(callee) &&
    !supported &&
    !environmentStringMethod(model, provenance, callee, invocation) &&
    unsupportedReceiver(model, callee.expression)
  )
    incomplete.push({
      file: origin,
      reason: `unsupported received property executable edge ${callee.getText()}`,
    });
}

export function inspectTagChannels(model, provenance, node, origin, incomplete) {
  if (!ts.isTemplateExpression(node.template)) return;
  const tag = model.externalName(node.tag);
  const supported =
    tag?.module === 'drizzle-orm' && tag.name === 'sql' && !provenance.isMutated(node.tag);
  for (const span of node.template.templateSpans)
    handleArguments(
      provenance,
      [span.expression],
      !(supported && trustedSchemaSqlValue(model, provenance, span.expression)),
      origin,
      incomplete
    );
}
