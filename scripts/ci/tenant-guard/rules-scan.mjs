// Tenant guard pass 1: per-file rules.

import ts from 'typescript';
import {
  CONNECTION_CONTROL,
  CONNECTION_CONTROL_MODULES,
  DRIVER_MODULES,
  DRIVER_SPECIFIERS,
  KERNEL,
  LEGACY,
  PRIVILEGED,
} from './manifest.mjs';
import { originKey } from './modules.mjs';
import { byCodeUnit } from './rules-digest.mjs';
import { unitOf } from './syntax.mjs';

const DECLARATION_FILE = /\.d\.[cm]?ts$/u;

/** Applies the per-file rules to every non-test source. */
export function scanFiles(ctx) {
  const {
    connectionControlUnits,
    covered,
    factsOf,
    graph,
    isPrivilegedModule,
    isTest,
    legacyOps,
    originsOf,
    sources,
    telemetry,
    violate,
  } = ctx;
  const deps = { connectionControlUnits, covered, graph, isPrivilegedModule, isTest, legacyOps };

  for (const file of [...sources.keys()].sort(byCodeUnit)) {
    if (isTest(file) || DECLARATION_FILE.test(file)) continue;
    const fact = factsOf(file);
    if (!fact) continue;
    telemetry.files += 1;
    const { sourceFile } = fact;
    const scan = {
      ...deps,
      file,
      fact,
      sourceFile,
      kernel: KERNEL.test(file),
      report: (node, rule, detail) => violate(file, node, sourceFile, rule, detail),
    };

    for (const reference of fact.references) {
      const { origins, form, namespace } = originsOf(fact, reference);
      if (form === 'namespace-value' && namespace?.some(isPrivilegedModule)) {
        scan.report(
          reference.node,
          'R-a',
          `opaque use of a privileged module object ${reference.node.text}`
        );
        continue;
      }
      for (const origin of origins) scanOrigin(scan, { reference, origin, form });
    }

    ts.forEachChild(sourceFile, function visit(node) {
      scanNode(scan, node);
      ts.forEachChild(node, visit);
    });
  }
}

// ---- references ------------------------------------------------------------------------------
function scanOrigin(scan, use) {
  const { reference, origin } = use;
  if (origin.unresolved && !scan.kernel) {
    scan.report(reference.node, 'C3', `unresolved workspace import ${origin.unresolved}`);
    return;
  }
  const key = originKey(origin);
  if (!key || origin.file === scan.file) return;
  const privileged = PRIVILEGED.get(key);
  if (privileged) checkPrivilegedUse(scan, use, key, privileged);
  else if (LEGACY.has(key) && !scan.kernel) checkLegacyUse(scan, use, key);
}

function checkPrivilegedUse(scan, { reference, origin, form }, key, privileged) {
  const reexported = form === 'export' && privileged.reexports.includes(scan.file);
  const allowedForm = form === privileged.form || reexported;
  if (!privileged.callers.includes(scan.file) && !reexported) {
    scan.report(reference.node, 'R-a', `${key} is not available to this file`);
  } else if (!allowedForm && !scan.covered(scan.fact, reference.node, `value:${origin.name}`)) {
    scan.report(
      reference.node,
      'R-a',
      `${key} used as ${form}; only a direct ${privileged.form} is allowed`
    );
  }
}

function checkLegacyUse(scan, { reference, origin, form }, key) {
  const { fact } = scan;
  const unit = unitOf(reference.node);
  const expected = key.endsWith('#db') ? 'member' : 'call';
  if (form === 'export') return; // importers resolve through the re-export to the origin
  if (form !== expected) {
    if (scan.covered(fact, reference.node, `value:${origin.name}`)) return;
    scan.report(
      reference.node,
      'C1',
      `${key} used as ${form}; legacy operations admit only a direct ${expected}`
    );
  } else if (fact.unchanged(unit)) {
    scan.legacyOps.push({ fact, unit, node: reference.node, form, key });
  } else {
    scan.report(reference.node, 'C1', `${key} in a changed unit; use withTenantAuthority`);
  }
}

// ---- syntax ----------------------------------------------------------------------------------
function scanNode(scan, node) {
  checkReexport(scan, node);
  checkStaticImport(scan, node);
  if (ts.isCallExpression(node)) checkCall(scan, node);
  if (
    ts.isNewExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === 'Function' &&
    !scan.covered(scan.fact, node, 'eval')
  ) {
    scan.report(node, 'R-e', 'new Function() evaluates opaque code');
  }
  if (
    !scan.kernel &&
    ts.isPropertyAccessExpression(node) &&
    node.name.text === '$client' &&
    !scan.covered(scan.fact, node, '$client')
  ) {
    scan.report(node, 'C3', '$client needs a source-bound contract');
  }
  checkConnectionControl(scan, node);
}

// Re-exports with a module specifier.
function checkReexport(scan, node) {
  if (
    !ts.isExportDeclaration(node) ||
    !node.moduleSpecifier ||
    !ts.isStringLiteral(node.moduleSpecifier) ||
    node.isTypeOnly
  ) {
    return;
  }
  for (const origin of reexportOrigins(scan, node, node.moduleSpecifier.text)) {
    const key = originKey(origin);
    const privileged = key && PRIVILEGED.get(key);
    if (privileged && !privileged.reexports.includes(scan.file)) {
      scan.report(node, 'R-a', `re-export of ${key}`);
    }
  }
}

function reexportOrigins({ file, graph }, node, specifier) {
  if (node.exportClause && ts.isNamedExports(node.exportClause)) {
    return node.exportClause.elements
      .filter(element => !element.isTypeOnly)
      .map(element => (element.propertyName ?? element.name).text)
      .flatMap(name => graph.resolveImport(file, specifier, name));
  }
  return graph
    .resolveSpecifier(file, specifier)
    .files.flatMap(target =>
      [...graph.exportNames(target)].flatMap(name => graph.resolveExport(target, name))
    );
}

// Static imports: drivers and test modules.
function checkStaticImport(scan, node) {
  if (!ts.isImportDeclaration(node) || !ts.isStringLiteral(node.moduleSpecifier)) return;
  const specifier = node.moduleSpecifier.text;
  checkDriverImport(scan, node, specifier);
  if (!node.importClause?.isTypeOnly) {
    checkTestImport(scan, node, scan.graph.resolveSpecifier(scan.file, specifier), specifier);
  }
}

function checkDriverImport(scan, node, specifier) {
  if (DRIVER_SPECIFIERS.test(specifier) && !DRIVER_MODULES.has(scan.file))
    scan.report(node, 'R-d', `driver import ${specifier}`);
}

function checkTestImport(scan, node, resolved, specifier) {
  if (resolved.files.some(scan.isTest))
    scan.report(node, 'R-a', `runtime import of test module ${specifier}`);
}

/** Whether `identifier` names no local binding: a global such as `require` or `eval`. */
function isUnbound(scan, identifier) {
  return !scan.fact.references.find(reference => reference.node === identifier)?.binding;
}

function checkCall(scan, node) {
  const callee = node.expression;
  // Dynamic import and require.
  const loader =
    callee.kind === ts.SyntaxKind.ImportKeyword ||
    (ts.isIdentifier(callee) && callee.text === 'require' && isUnbound(scan, callee));
  if (loader && !scan.kernel) checkDynamicImport(scan, node);
  // eval / Function.
  if (
    ts.isIdentifier(callee) &&
    ['eval', 'Function'].includes(callee.text) &&
    isUnbound(scan, callee) &&
    !scan.covered(scan.fact, node, 'eval')
  ) {
    scan.report(node, 'R-e', `${callee.text}() evaluates opaque code`);
  }
  // C3: raw execution outside the database package.
  if (!scan.kernel && ts.isPropertyAccessExpression(callee)) {
    const kind = rawExecutionKind(node, callee, scan.sourceFile);
    if (kind && !scan.covered(scan.fact, node, kind))
      scan.report(node, 'C3', `${kind} needs a source-bound contract`);
  }
  // drizzle() construction.
  if (ts.isIdentifier(callee) && callee.text === 'drizzle' && !DRIVER_MODULES.has(scan.file)) {
    scan.report(node, 'R-d', 'drizzle() client construction');
  }
}

function checkDynamicImport(scan, node) {
  const argument = node.arguments[0];
  if (!argument || !ts.isStringLiteralLike(argument)) {
    if (!scan.covered(scan.fact, node, 'dynamic-import'))
      scan.report(node, 'R-e', 'opaque dynamic import');
    return;
  }
  const specifier = argument.text;
  const resolved = scan.graph.resolveSpecifier(scan.file, specifier);
  checkDriverImport(scan, node, specifier);
  if (
    resolved.files.some(scan.isPrivilegedModule) &&
    !scan.covered(scan.fact, node, 'dynamic-import')
  ) {
    scan.report(node, 'R-e', `dynamic import of privileged module ${specifier}`);
  }
  checkTestImport(scan, node, resolved, specifier);
}

/** The contracted raw-execution kind a `x.name(…)` call performs, or null. */
function rawExecutionKind(node, callee, sourceFile) {
  const name = callee.name.text;
  if (name === 'execute') {
    // `.execute(callback)` (circuit breakers, idempotency wrappers) runs no SQL.
    const first = node.arguments[0];
    const sqlArgument = first && !ts.isArrowFunction(first) && !ts.isFunctionExpression(first);
    return sqlArgument ? 'execute' : null;
  }
  return name === 'raw' && callee.expression.getText(sourceFile) === 'sql' ? 'sql.raw' : null;
}

// Connection-control SQL text.
function checkConnectionControl(scan, node) {
  const text =
    ts.isStringLiteral(node) ||
    ts.isNoSubstitutionTemplateLiteral(node) ||
    ts.isTemplateHead(node) ||
    ts.isTemplateMiddle(node) ||
    ts.isTemplateTail(node);
  if (!text || !CONNECTION_CONTROL.test(node.text) || CONNECTION_CONTROL_MODULES.has(scan.file))
    return;
  if (scan.covered(scan.fact, node, 'connection-control'))
    scan.connectionControlUnits.push({ fact: scan.fact, unit: unitOf(node) });
  else scan.report(node, 'R-d', 'connection-control SQL outside tenant.ts');
}
