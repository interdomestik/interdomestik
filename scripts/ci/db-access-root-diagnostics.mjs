import ts from 'typescript';
import { isErasedTypeEdge } from './db-access-module-edges.mjs';

const TEST_SOURCE = /(^|\/)__tests__\/|\.(test|spec)\.[cm]?[jt]sx?$/u;
const UNKNOWN_LOADERS = new Set(['eval', 'Function', 'require', 'createRequire']);

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
        const loader = node.expression.getText().split('.').at(-1);
        if (UNKNOWN_LOADERS.has(loader)) {
          unknowns.push({
            file,
            line: location(source, node),
            code: 'unsupported-dynamic-loader',
            loader,
          });
        }
      }
      if (ts.isIdentifier(node) && UNKNOWN_LOADERS.has(node.text)) {
        unknowns.push({
          file,
          line: location(source, node),
          code: 'unsupported-dynamic-loader',
          loader: node.text,
        });
      }
      if (
        ts.isElementAccessExpression(node) &&
        ts.isStringLiteral(node.argumentExpression) &&
        UNKNOWN_LOADERS.has(node.argumentExpression.text)
      ) {
        unknowns.push({
          file,
          line: location(source, node),
          code: 'unsupported-dynamic-loader',
          loader: node.argumentExpression.text,
        });
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
        const loader = node.expression.getText().split('.').at(-1);
        if (UNKNOWN_LOADERS.has(loader)) {
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
    .sort();
  const reached = new Set(production);
  const predecessor = new Map();
  const queue = [...production];
  for (let index = 0; index < queue.length; index += 1) {
    const file = queue[index];
    for (const target of [...(moduleTargets.dependencies.get(file) ?? [])].sort()) {
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
    .sort()
    .map(file => {
      if (reached.has(file)) {
        return {
          file,
          classification: 'production-reachable',
          witnessPath: witnessPath(file, predecessor),
        };
      }
      if (productionUnknowns.length) {
        return { file, classification: 'unproven', evidence: 'analysisUnknowns' };
      }
      return { file, classification: 'literal-disconnected' };
    });
  return { version: 1, analysisUnknowns: productionUnknowns, testConsumerRoots };
}
