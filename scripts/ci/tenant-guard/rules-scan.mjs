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
import { unitOf } from './syntax.mjs';

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

  for (const file of [...sources.keys()].sort()) {
    if (isTest(file) || /\.d\.[cm]?ts$/u.test(file)) continue;
    const fact = factsOf(file);
    if (!fact) continue;
    telemetry.files += 1;
    const { sourceFile } = fact;
    const kernel = KERNEL.test(file);

    for (const reference of fact.references) {
      const { origins, form, namespace } = originsOf(fact, reference);
      if (form === 'namespace-value' && namespace?.some(isPrivilegedModule)) {
        violate(
          file,
          reference.node,
          sourceFile,
          'R-a',
          `opaque use of a privileged module object ${reference.node.text}`
        );
        continue;
      }
      for (const origin of origins) {
        if (origin.unresolved && !kernel) {
          violate(
            file,
            reference.node,
            sourceFile,
            'C3',
            `unresolved workspace import ${origin.unresolved}`
          );
          continue;
        }
        const key = originKey(origin);
        if (!key || origin.file === file) continue;
        const privileged = PRIVILEGED.get(key);
        if (privileged) {
          const allowedForm =
            form === privileged.form || (form === 'export' && privileged.reexports.includes(file));
          if (
            !privileged.callers.includes(file) &&
            !(form === 'export' && privileged.reexports.includes(file))
          ) {
            violate(
              file,
              reference.node,
              sourceFile,
              'R-a',
              `${key} is not available to this file`
            );
          } else if (!allowedForm && !covered(fact, reference.node, `value:${origin.name}`)) {
            violate(
              file,
              reference.node,
              sourceFile,
              'R-a',
              `${key} used as ${form}; only a direct ${privileged.form} is allowed`
            );
          }
          continue;
        }
        if (LEGACY.has(key) && !kernel) {
          const unit = unitOf(reference.node);
          const expected = key.endsWith('#db') ? 'member' : 'call';
          if (form === 'export') continue; // importers resolve through the re-export to the origin
          if (form !== expected) {
            if (covered(fact, reference.node, `value:${origin.name}`)) continue;
            violate(
              file,
              reference.node,
              sourceFile,
              'C1',
              `${key} used as ${form}; legacy operations admit only a direct ${expected}`
            );
          } else if (!fact.unchanged(unit)) {
            violate(
              file,
              reference.node,
              sourceFile,
              'C1',
              `${key} in a changed unit; use withTenantAuthority`
            );
          } else {
            legacyOps.push({ fact, unit, node: reference.node, form, key });
          }
        }
      }
    }

    ts.forEachChild(sourceFile, function visit(node) {
      // Re-exports with a module specifier.
      if (
        ts.isExportDeclaration(node) &&
        node.moduleSpecifier &&
        ts.isStringLiteral(node.moduleSpecifier) &&
        !node.isTypeOnly
      ) {
        const specifier = node.moduleSpecifier.text;
        const names =
          node.exportClause && ts.isNamedExports(node.exportClause)
            ? node.exportClause.elements
                .filter(element => !element.isTypeOnly)
                .map(element => (element.propertyName ?? element.name).text)
            : null;
        const origins = names
          ? names.flatMap(name => graph.resolveImport(file, specifier, name))
          : graph
              .resolveSpecifier(file, specifier)
              .files.flatMap(target =>
                [...graph.exportNames(target)].flatMap(name => graph.resolveExport(target, name))
              );
        for (const origin of origins) {
          const key = originKey(origin);
          const privileged = key && PRIVILEGED.get(key);
          if (privileged && !privileged.reexports.includes(file)) {
            violate(file, node, sourceFile, 'R-a', `re-export of ${key}`);
          }
        }
      }
      // Static imports: drivers and test modules.
      if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
        const specifier = node.moduleSpecifier.text;
        if (DRIVER_SPECIFIERS.test(specifier) && !DRIVER_MODULES.has(file)) {
          violate(file, node, sourceFile, 'R-d', `driver import ${specifier}`);
        }
        if (!node.importClause?.isTypeOnly) {
          const resolved = graph.resolveSpecifier(file, specifier);
          if (resolved.files.some(isTest))
            violate(file, node, sourceFile, 'R-a', `runtime import of test module ${specifier}`);
        }
      }
      if (ts.isCallExpression(node)) {
        const callee = node.expression;
        // Dynamic import and require.
        const loader =
          callee.kind === ts.SyntaxKind.ImportKeyword ||
          (ts.isIdentifier(callee) &&
            callee.text === 'require' &&
            !fact.references.find(reference => reference.node === callee)?.binding);
        if (loader && !kernel) {
          const argument = node.arguments[0];
          if (!argument || !ts.isStringLiteralLike(argument)) {
            if (!covered(fact, node, 'dynamic-import'))
              violate(file, node, sourceFile, 'R-e', 'opaque dynamic import');
          } else {
            const specifier = argument.text;
            const resolved = graph.resolveSpecifier(file, specifier);
            if (DRIVER_SPECIFIERS.test(specifier) && !DRIVER_MODULES.has(file))
              violate(file, node, sourceFile, 'R-d', `driver import ${specifier}`);
            if (resolved.files.some(isPrivilegedModule) && !covered(fact, node, 'dynamic-import')) {
              violate(
                file,
                node,
                sourceFile,
                'R-e',
                `dynamic import of privileged module ${specifier}`
              );
            }
            if (resolved.files.some(isTest))
              violate(file, node, sourceFile, 'R-a', `runtime import of test module ${specifier}`);
          }
        }
        // eval / Function.
        if (
          ts.isIdentifier(callee) &&
          ['eval', 'Function'].includes(callee.text) &&
          !fact.references.find(reference => reference.node === callee)?.binding
        ) {
          if (!covered(fact, node, 'eval'))
            violate(file, node, sourceFile, 'R-e', `${callee.text}() evaluates opaque code`);
        }
        // C3: raw execution outside the database package.
        if (!kernel && ts.isPropertyAccessExpression(callee)) {
          const name = callee.name.text;
          // `.execute(callback)` (circuit breakers, idempotency wrappers) runs no SQL.
          const first = node.arguments[0];
          const sqlArgument =
            first && !ts.isArrowFunction(first) && !ts.isFunctionExpression(first);
          const kind =
            name === 'execute' && sqlArgument
              ? 'execute'
              : name === 'raw' && callee.expression.getText(sourceFile) === 'sql'
                ? 'sql.raw'
                : null;
          if (kind && !covered(fact, node, kind))
            violate(file, node, sourceFile, 'C3', `${kind} needs a source-bound contract`);
        }
        // drizzle() construction.
        if (ts.isIdentifier(callee) && callee.text === 'drizzle' && !DRIVER_MODULES.has(file)) {
          violate(file, node, sourceFile, 'R-d', 'drizzle() client construction');
        }
      }
      if (
        ts.isNewExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === 'Function'
      ) {
        if (!covered(fact, node, 'eval'))
          violate(file, node, sourceFile, 'R-e', 'new Function() evaluates opaque code');
      }
      if (!kernel && ts.isPropertyAccessExpression(node) && node.name.text === '$client') {
        if (!covered(fact, node, '$client'))
          violate(file, node, sourceFile, 'C3', '$client needs a source-bound contract');
      }
      // Connection-control SQL text.
      if (
        (ts.isStringLiteral(node) ||
          ts.isNoSubstitutionTemplateLiteral(node) ||
          ts.isTemplateHead(node) ||
          ts.isTemplateMiddle(node) ||
          ts.isTemplateTail(node)) &&
        CONNECTION_CONTROL.test(node.text) &&
        !CONNECTION_CONTROL_MODULES.has(file)
      ) {
        if (!covered(fact, node, 'connection-control'))
          violate(file, node, sourceFile, 'R-d', 'connection-control SQL outside tenant.ts');
        else connectionControlUnits.push({ fact, unit: unitOf(node) });
      }
      ts.forEachChild(node, visit);
    });
  }
}
