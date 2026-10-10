import ts from 'typescript';
import { trustedSchemaColumn } from './db-access-external.mjs';
// Fixed epoch policy; candidate constants/catalogs are comparison inputs, not permission.
export const DIRECT_DB_METHODS = [
  'query',
  'select',
  'selectDistinct',
  'selectDistinctOn',
  'insert',
  'update',
  'delete',
  'execute',
  'transaction',
];
import { digest } from './db-access-trust.mjs';
import { ownerOf, runtimeFingerprint, unwrap } from './db-access-source.mjs';

export function collectInventory(model, provenance, trustedSources) {
  const entries = [];
  const changed = new Set();
  const fingerprints = new Map();
  for (const [file, sf] of model.parsed) {
    const source = model.sources.get(file);
    const trusted = trustedSources.get(file);
    // Only executable changes invalidate debt, never a first-line/tuple identity.
    let identical = trusted === source;
    if (!identical && trusted !== undefined)
      identical = runtimeFingerprint(source) === runtimeFingerprint(trusted);
    if (!identical) changed.add(file);
    const fingerprint = runtimeFingerprint(source);
    fingerprints.set(file, fingerprint);
    model.walk(sf, node => {
      const returning =
        node.parent &&
        (((ts.isReturnStatement(node.parent) ||
          ts.isThrowStatement(node.parent) ||
          ts.isYieldExpression(node.parent)) &&
          node.parent.expression === node) ||
          (ts.isArrowFunction(node.parent) && node.parent.body === node && !ts.isBlock(node)));
      const handle = returning && provenance.tenantHandle(node);
      const escapedHandle = handle === true;
      const unsupportedHandle =
        handle === 'unknown' && !trustedSchemaColumn(model, provenance, node);
      if (
        !ts.isPropertyAccessExpression(node) &&
        !ts.isIdentifier(node) &&
        !escapedHandle &&
        !unsupportedHandle
      )
        return;
      let ancestor = node.parent;
      while (ancestor && !ts.isSourceFile(ancestor)) {
        if (
          ts.isTypeNode(ancestor) ||
          ts.isImportDeclaration(ancestor) ||
          ts.isExportDeclaration(ancestor)
        )
          return;
        ancestor = ancestor.parent;
      }
      const property = ts.isPropertyAccessExpression(node);
      const client = provenance.clientIdentity(property ? node.expression : node);
      const ambient = ['db', 'dbRls', 'dbAdmin'].includes(client);
      const method = property ? node.name.text : 'escape';
      if (
        !ambient &&
        !escapedHandle &&
        !unsupportedHandle &&
        (!property || !DIRECT_DB_METHODS.includes(method))
      )
        return;
      if (!property && !escapedHandle && !unsupportedHandle) {
        if (
          (node.parent.name === node &&
            !ts.isShorthandPropertyAssignment(node.parent) &&
            !ts.isBindingElement(node.parent)) ||
          (ts.isPropertyAccessExpression(node.parent) && node.parent.expression === node)
        )
          return;
        if (
          ts.isVariableDeclaration(node.parent) &&
          ts.isIdentifier(node.parent.name) &&
          node.parent.initializer === node
        )
          return;
      }
      let call = node.parent;
      while (call && unwrap(call) === node) call = call.parent;
      const invoked = call && ts.isCallExpression(call) && unwrap(call.expression) === node;
      const indirect = property && method !== 'query' && !invoked;
      const receiver = escapedHandle
        ? 'tenant-context'
        : ambient
          ? client
          : provenance.provenance(node.expression);
      const owner = ownerOf(node);
      const target = invoked ? call.arguments[0] : undefined;
      const claimName =
        target &&
        model.declaration(ts.isPropertyAccessExpression(target) ? target.name : target)?.name?.text;
      const claimsUpdateTarget =
        method === 'update' &&
        (claimName === 'claims' ||
          /^(?:\w+\.)?(claims|claimsTable)$/u.test(target?.getText() ?? ''));
      const position = sf.getLineAndCharacterOfPosition(node.getStart());
      entries.push({
        file,
        line: position.line + 1,
        callee: node.getText(),
        method,
        tenantPosture:
          receiver === 'tenant-context'
            ? receiver
            : receiver === 'dbAdmin' || receiver === 'dbRls'
              ? 'admin-privileged'
              : 'unclassified',
        tenantPostureReason:
          receiver === 'tenant-context'
            ? 'tenant-context: proven-symbol-invocations'
            : `unclassified: ${receiver}`,
        isDirectDbAlias: receiver !== 'tenant-context',
        claimsUpdateTarget,
        ...(escapedHandle
          ? { reason: 'tenant transaction handle escapes callback' }
          : unsupportedHandle
            ? { reason: 'unsupported returned handle analysis bound, cycle or mutated value' }
            : {}),
        risk: file.startsWith('packages/domain-') ? 'domain-wrapper' : 'app-layer',
        source: node.getText(),
        identity: digest(`${file}|${fingerprint}|${node.pos}|${method}`),
        historicalDebt: identical,
        _indirect: indirect || escapedHandle,
        _incomplete: unsupportedHandle,
        _node: node,
        _owner: owner,
      });
    });
  }
  return { entries, changed, fingerprints };
}

export function isUnsafe(entry) {
  if (entry._indirect) return true; // Extracted/bound query methods have unsupported receiver/lifetime.
  if (
    entry.claimsUpdateTarget &&
    entry.isDirectDbAlias &&
    entry.file !== 'packages/domain-claims/src/claims/transition.ts'
  )
    return true;
  return entry.tenantPosture !== 'tenant-context';
}

export function canonicalQueryChain(expression, provenance) {
  // Invoked builder methods stay on the receiver; bare member hops can reach prototypes.
  if (!ts.isPropertyAccessExpression(expression)) return false;
  const receiver = expression.expression;
  if (
    DIRECT_DB_METHODS.includes(expression.name.text) &&
    provenance.provenance(receiver) === 'tenant-context'
  )
    return true;
  if (ts.isCallExpression(receiver)) return canonicalQueryChain(receiver.expression, provenance);
  return (
    ['findFirst', 'findMany'].includes(expression.name.text) &&
    ts.isPropertyAccessExpression(receiver) &&
    ts.isPropertyAccessExpression(receiver.expression) &&
    receiver.expression.name.text === 'query' &&
    provenance.provenance(receiver.expression.expression) === 'tenant-context'
  );
}
