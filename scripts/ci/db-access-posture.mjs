import ts from 'typescript';

import { DIRECT_DB_METHODS, TENANT_POSTURES } from './db-access-constants.mjs';

const DIRECT_DB_METHOD_SET = new Set(DIRECT_DB_METHODS);

const TENANT_CONTEXT_REASONS = {
  alias: 'tenant-context: callback-tx-alias',
  block: 'tenant-context: callback-tx-block',
};

export const TENANT_POSTURE_REASONS = {
  tenantScoped: 'tenant-scoped: directive',
  tenantPredicate: 'tenant-predicate: in-where-clause',
  adminPrivileged: 'admin-privileged: dbAdmin',
  rawRlsPrivileged: 'admin-privileged: dbRls',
  systemExempt: 'system-exempt: directive',
  unclassified: 'unclassified: no-recognized-context',
};

function nodeText(source, node) {
  return source.slice(node.getStart(), node.end);
}

function isDirectMethod(name) {
  return DIRECT_DB_METHOD_SET.has(name);
}

function propertyAccessParts(expression) {
  if (!ts.isPropertyAccessExpression(expression)) return null;
  const object = expression.expression;
  if (!ts.isIdentifier(object)) return null;
  return { objectName: object.text, propertyName: expression.name.text };
}

function callbackParameterName(callback) {
  if (!ts.isArrowFunction(callback) && !ts.isFunctionExpression(callback)) return null;
  const [parameter] = callback.parameters;
  if (!parameter || !ts.isIdentifier(parameter.name)) return null;
  return parameter.name.text;
}

function collectTenantContextNames(sourceFile) {
  const names = new Set(['withTenantContext', 'withTenantDb']);

  function visit(node) {
    if (ts.isImportDeclaration(node) && node.importClause?.namedBindings) {
      const bindings = node.importClause.namedBindings;
      if (ts.isNamedImports(bindings)) {
        for (const element of bindings.elements) {
          const importedName = element.propertyName?.text ?? element.name.text;
          if (importedName === 'withTenantContext' || importedName === 'withTenantDb') {
            names.add(element.name.text);
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return names;
}

function collectNestedTransactionAliases(sourceFile, rootAliases, boundaryStart, boundaryEnd) {
  const aliases = new Set(rootAliases);

  function visit(node) {
    const start = node.getStart(sourceFile);
    if (node.end < boundaryStart || start > boundaryEnd) return;

    if (start >= boundaryStart && node.end <= boundaryEnd && ts.isCallExpression(node)) {
      const parts = propertyAccessParts(node.expression);
      if (parts?.propertyName === 'transaction' && aliases.has(parts.objectName)) {
        const callback = node.arguments[0];
        const nestedName = callback ? callbackParameterName(callback) : null;
        if (nestedName) {
          aliases.add(nestedName);
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  ts.forEachChild(sourceFile, visit);
  return aliases;
}

function collectTenantContextRanges(sourceFile, source) {
  const contextNames = collectTenantContextNames(sourceFile);
  const ranges = [];

  function visit(node) {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      const calleeName = node.expression.text;
      if (contextNames.has(calleeName)) {
        const callback = node.arguments[1];
        const parameterName = callback ? callbackParameterName(callback) : null;
        if (parameterName && (ts.isArrowFunction(callback) || ts.isFunctionExpression(callback))) {
          const body = callback.body;
          const start = body.getStart(sourceFile);
          const end = body.end;
          const reason = ts.isBlock(body)
            ? TENANT_CONTEXT_REASONS.block
            : TENANT_CONTEXT_REASONS.alias;
          const aliases = collectNestedTransactionAliases(sourceFile, [parameterName], start, end);
          ranges.push({
            start,
            end,
            aliases,
            reason,
            source: nodeText(source, node),
          });
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return ranges;
}

function findStatementNode(sourceFile, index) {
  let best = null;

  function visit(node) {
    if (index < node.getStart(sourceFile) || index > node.end) return;
    if (ts.isStatement(node) || ts.isVariableStatement(node)) {
      best = node;
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return best;
}

function isNonLiteralTenantIdentifier(expression) {
  if (ts.isIdentifier(expression)) return true;
  if (ts.isPropertyAccessExpression(expression)) return true;
  if (ts.isStringLiteralLike(expression)) return false;
  if (ts.isNumericLiteral(expression)) return false;
  return false;
}

function expressionMentionsTenantColumn(expressionText) {
  return /(?:^|[.\W])tenant(?:Id|ID|_id)(?:$|[.\W])/u.test(expressionText);
}

function callHasTenantPredicate(call, source) {
  if (ts.isIdentifier(call.expression) && call.expression.text === 'withTenant') {
    const [tenantValue, tenantColumn] = call.arguments;
    return Boolean(
      tenantValue &&
      tenantColumn &&
      isNonLiteralTenantIdentifier(tenantValue) &&
      expressionMentionsTenantColumn(nodeText(source, tenantColumn))
    );
  }

  if (
    ts.isIdentifier(call.expression) &&
    call.expression.text === 'eq' &&
    call.arguments.length >= 2
  ) {
    const [left, right] = call.arguments;
    return (
      expressionMentionsTenantColumn(nodeText(source, left)) && isNonLiteralTenantIdentifier(right)
    );
  }

  return false;
}

function statementHasTenantPredicate(sourceFile, source, index) {
  const statement = findStatementNode(sourceFile, index);
  if (!statement) return false;
  const statementText = nodeText(source, statement);
  if (!/\bwhere\s*[:.(]/u.test(statementText)) return false;

  let found = false;
  function visit(node) {
    if (found) return;
    if (ts.isCallExpression(node) && callHasTenantPredicate(node, source)) {
      found = true;
      return;
    }
    ts.forEachChild(node, visit);
  }

  visit(statement);
  return found;
}

function directiveForLine(lines, lineNumber) {
  const previousLine = lines[lineNumber - 2]?.trim();
  if (!previousLine) return null;

  const match = previousLine.match(
    /^\/\/\s*db-access-guard:\s*(system-exempt|tenant-scoped)\s*--\s*reason:\s*(\S.*)$/u
  );
  return match ? { kind: match[1], reason: match[2].trim() } : null;
}

function findTenantContextRange(ranges, matchIndex, calleeAlias) {
  return ranges.find(
    range => matchIndex >= range.start && matchIndex <= range.end && range.aliases.has(calleeAlias)
  );
}

export function createTenantPostureClassifier(source, fileName = 'source.ts') {
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );
  const tenantContextRanges = collectTenantContextRanges(sourceFile, source);
  const lines = source.split(/\r?\n/u);

  return function classifyTenantPosture({
    matchIndex,
    calleeAlias,
    isAdminAlias,
    isRlsAlias,
    method,
    line,
  }) {
    const directiveReason = directiveForLine(lines, line);
    if (directiveReason) {
      if (directiveReason.kind === 'tenant-scoped') {
        return {
          tenantPosture: 'tenant-scoped',
          tenantPostureReason: TENANT_POSTURE_REASONS.tenantScoped,
          tenantPostureDetail: directiveReason.reason,
        };
      }

      return {
        tenantPosture: 'system-exempt',
        tenantPostureReason: TENANT_POSTURE_REASONS.systemExempt,
        tenantPostureDetail: directiveReason.reason,
      };
    }

    if (calleeAlias === 'dbAdmin' || isAdminAlias)
      return {
        tenantPosture: 'admin-privileged',
        tenantPostureReason: TENANT_POSTURE_REASONS.adminPrivileged,
      };

    if (calleeAlias === 'dbRls' || isRlsAlias)
      return {
        tenantPosture: 'admin-privileged',
        tenantPostureReason: TENANT_POSTURE_REASONS.rawRlsPrivileged,
      };

    const tenantContextRange = findTenantContextRange(tenantContextRanges, matchIndex, calleeAlias);
    if (tenantContextRange && isDirectMethod(method)) {
      return {
        tenantPosture: 'tenant-context',
        tenantPostureReason: tenantContextRange.reason,
      };
    }

    if (statementHasTenantPredicate(sourceFile, source, matchIndex)) {
      return {
        tenantPosture: 'tenant-predicate',
        tenantPostureReason: TENANT_POSTURE_REASONS.tenantPredicate,
      };
    }

    return {
      tenantPosture: 'unclassified',
      tenantPostureReason: TENANT_POSTURE_REASONS.unclassified,
    };
  };
}

export function collectTenantContextAliasNames(source, fileName = 'source.ts') {
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );
  const aliases = new Set();
  for (const range of collectTenantContextRanges(sourceFile, source)) {
    for (const alias of range.aliases) {
      aliases.add(alias);
    }
  }
  return aliases;
}

export function createEmptyPostureCounts() {
  return Object.fromEntries(TENANT_POSTURES.map(posture => [posture, 0]));
}
