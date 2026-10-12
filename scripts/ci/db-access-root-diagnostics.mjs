import ts from 'typescript';
import { isErasedTypeEdge } from './db-access-module-edges.mjs';

const TEST_SOURCE =
  /(?:(?:^|\/)(?:__tests__|__mocks__|tests?|e2e)\/|\.(?:test|spec|e2e)\.[cm]?[jt]sx?$)/u;
const UNKNOWN_LOADERS = new Set(['eval', 'Function', 'require', 'createRequire']);
const LOADER_HOSTS = new Set([
  'global',
  'globalThis',
  'module',
  'process',
  'window',
  'self',
  'frames',
  'parent',
  'top',
]);
const compareCodeUnits = (left, right) => (left < right ? -1 : left > right ? 1 : 0);

function staticPropertyName(node) {
  return ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)
    ? node.text
    : undefined;
}

function rootIdentifier(node) {
  let current = node;
  while (ts.isPropertyAccessExpression(current) || ts.isElementAccessExpression(current))
    current = current.expression;
  return ts.isIdentifier(current) ? current.text : undefined;
}

function identifierLoader(model, node) {
  if (!ts.isIdentifier(node) || !UNKNOWN_LOADERS.has(node.text)) return undefined;
  const external = model.externalName(node);
  if (external?.module === 'node:module' && external.name === 'createRequire') {
    return 'createRequire';
  }
  return model.declaration(node) ? undefined : node.text;
}

function directLoader(model, node) {
  if (ts.isIdentifier(node)) return identifierLoader(model, node);
  if (ts.isPropertyAccessExpression(node)) return identifierLoader(model, node.name);
  return undefined;
}

function reflectedLoader(model, node) {
  if (!ts.isCallExpression(node)) return undefined;
  const callee = node.expression;
  const isReflectGet =
    (ts.isPropertyAccessExpression(callee) &&
      ts.isIdentifier(callee.expression) &&
      callee.expression.text === 'Reflect' &&
      callee.name.text === 'get') ||
    (ts.isElementAccessExpression(callee) &&
      ts.isIdentifier(callee.expression) &&
      callee.expression.text === 'Reflect' &&
      staticPropertyName(callee.argumentExpression) === 'get');
  if (!isReflectGet) return undefined;
  if (model.declaration(callee.expression)) return undefined;
  const property = node.arguments[1] && staticPropertyName(node.arguments[1]);
  const host = node.arguments[0] && rootIdentifier(node.arguments[0]);
  if (property !== undefined && !UNKNOWN_LOADERS.has(property)) return undefined;
  if (property === undefined && !LOADER_HOSTS.has(host)) return undefined;
  return property ?? 'Reflect.get(computed)';
}

function location(source, node) {
  return source.getLineAndCharacterOfPosition(node.getStart()).line + 1;
}

function sortedUniqueUnknowns(items) {
  const unique = new Map();
  for (const item of items) unique.set(JSON.stringify(item), item);
  return [...unique.values()].sort(
    (left, right) =>
      left.file.localeCompare(right.file) ||
      left.line - right.line ||
      left.code.localeCompare(right.code) ||
      (left.specifier ?? left.loader ?? '').localeCompare(right.specifier ?? right.loader ?? '')
  );
}

export function analyzeModuleTargets(model) {
  const dependencies = new Map();
  const unknowns = [];
  for (const [file, source] of model.parsed) {
    const targets = new Set();
    dependencies.set(file, targets);
    for (const diagnostic of source.parseDiagnostics) {
      const start = diagnostic.start ?? 0;
      unknowns.push({
        file,
        line: source.getLineAndCharacterOfPosition(start).line + 1,
        code: 'parse-diagnostics',
        diagnosticCode: diagnostic.code,
      });
    }
    const moduleTarget = (specifier, node) => {
      const target = model.moduleFile(specifier, file);
      if (target) targets.add(target);
      else if (!model.externalModule(specifier, file)) {
        unknowns.push({
          file,
          line: location(source, node),
          code: 'unresolved-runtime-module',
          specifier,
        });
      }
    };
    model.walk(source, node => {
      if (
        (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
        node.moduleSpecifier &&
        ts.isStringLiteral(node.moduleSpecifier) &&
        !isErasedTypeEdge(node)
      ) {
        moduleTarget(node.moduleSpecifier.text, node.moduleSpecifier);
        return;
      }
      if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        if (ts.isStringLiteral(node.arguments[0])) {
          moduleTarget(node.arguments[0].text, node.arguments[0]);
        } else {
          unknowns.push({
            file,
            line: location(source, node),
            code: 'nonliteral-dynamic-import',
          });
        }
        return;
      }
      if (ts.isCallExpression(node)) {
        const reflected = reflectedLoader(model, node);
        if (reflected) {
          unknowns.push({
            file,
            line: location(source, node),
            code: 'unsupported-dynamic-loader',
            loader: reflected,
          });
        }
        const loader = directLoader(model, node.expression);
        if (loader) {
          unknowns.push({
            file,
            line: location(source, node),
            code: 'unsupported-dynamic-loader',
            loader,
          });
        }
      }
      if (ts.isIdentifier(node)) {
        const loader = identifierLoader(model, node);
        if (!loader) return;
        unknowns.push({
          file,
          line: location(source, node),
          code: 'unsupported-dynamic-loader',
          loader,
        });
      }
      if (ts.isElementAccessExpression(node)) {
        const property = staticPropertyName(node.argumentExpression);
        const computedLoader =
          property === undefined && LOADER_HOSTS.has(rootIdentifier(node.expression));
        if (UNKNOWN_LOADERS.has(property) || computedLoader) {
          unknowns.push({
            file,
            line: location(source, node),
            code: 'unsupported-dynamic-loader',
            loader: property ?? 'computed-property',
          });
        }
      }
      if (ts.isImportEqualsDeclaration(node) && !node.isTypeOnly) {
        unknowns.push({
          file,
          line: location(source, node),
          code: 'unsupported-dynamic-loader',
          loader: 'require',
        });
      }
      if (ts.isNewExpression(node)) {
        const loader = directLoader(model, node.expression);
        if (loader) {
          unknowns.push({
            file,
            line: location(source, node),
            code: 'unsupported-dynamic-loader',
            loader,
          });
        }
      }
    });
  }
  return { dependencies, unknowns: sortedUniqueUnknowns(unknowns) };
}

function productionReachability(moduleTargets) {
  const production = [...moduleTargets.dependencies.keys()]
    .filter(file => !TEST_SOURCE.test(file))
    .sort(compareCodeUnits);
  const reached = new Set(production);
  const predecessor = new Map();
  const queue = [...production];
  for (let index = 0; index < queue.length; index += 1) {
    const file = queue[index];
    for (const target of [...(moduleTargets.dependencies.get(file) ?? [])].sort(compareCodeUnits)) {
      if (reached.has(target)) continue;
      reached.add(target);
      predecessor.set(target, file);
      queue.push(target);
    }
  }
  return { reached, predecessor };
}

function witnessPath(file, predecessor) {
  const path = [file];
  let current = file;
  while (predecessor.has(current)) {
    current = predecessor.get(current);
    path.unshift(current);
  }
  return path;
}

export function rootDiagnostics(moduleTargets, directChanges, firstInvalidatingDependency) {
  const { reached, predecessor } = productionReachability(moduleTargets);
  const productionUnknowns = moduleTargets.unknowns.filter(item => reached.has(item.file));
  const testConsumerRoots = [...firstInvalidatingDependency.keys()]
    .filter(file => !directChanges.has(file) && TEST_SOURCE.test(file))
    .sort(compareCodeUnits)
    .map(file => {
      if (reached.has(file)) {
        return {
          file,
          classification: 'production-reachable',
          witnessPath: witnessPath(file, predecessor),
        };
      }
      return {
        file,
        classification: 'unproven',
        evidence: productionUnknowns.length ? 'analysisUnknowns' : 'boundedModuleGraph',
      };
    });
  return { version: 1, analysisUnknowns: productionUnknowns, testConsumerRoots };
}
