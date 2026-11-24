import { existsSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';

const configNames = ['vitest.config', 'vite.config'].flatMap(name =>
  ['ts', 'mts', 'cts', 'js', 'mjs', 'cjs'].map(extension => `${name}.${extension}`)
);

function literalObject(node, validators) {
  if (!ts.isObjectLiteralExpression(node)) return false;
  const seen = new Set();
  for (const property of node.properties) {
    if (!ts.isPropertyAssignment(property)) return false;
    const { name, initializer } = property;
    if (
      !(ts.isIdentifier(name) || ts.isStringLiteral(name)) ||
      !Object.hasOwn(validators, name.text) ||
      seen.has(name.text) ||
      !validators[name.text](initializer)
    )
      return false;
    seen.add(name.text);
  }
  return true;
}

const strings = node =>
  ts.isArrayLiteralExpression(node) && node.elements.every(ts.isStringLiteral);
const isString = value => node => ts.isStringLiteral(node) && node.text === value;
const coverageOptions = {
  provider: isString('v8'),
  reporter: strings,
  reportsDirectory: ts.isStringLiteral,
  include: strings,
  exclude: strings,
};
const testOptions = {
  environment: isString('node'),
  include: strings,
  exclude: strings,
  allowOnly: node => node.kind === ts.SyntaxKind.FalseKeyword,
  coverage: node => literalObject(node, coverageOptions),
};

// Restrict credit to direct, literal configs. Imports, hooks, filters and alternate
// projects can change which cases run without changing Vitest's file list.
export function hasUnfilteredCoverageConfig(root, project, read) {
  const configs = configNames.filter(name => existsSync(join(root, project, name)));
  if (configs.length !== 1 || configs[0] !== 'vitest.config.ts') return false;
  const file = `${project}/${configs[0]}`;
  const source = ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true);
  if (source.parseDiagnostics.length || source.statements.length !== 2) return false;
  const [dependency, config] = source.statements;
  if (
    !ts.isImportDeclaration(dependency) ||
    !ts.isStringLiteral(dependency.moduleSpecifier) ||
    dependency.moduleSpecifier.text !== 'vitest/config' ||
    !ts.isExportAssignment(config) ||
    config.isExportEquals
  )
    return false;
  const { importClause } = dependency;
  const names = importClause?.namedBindings;
  if (!names || !ts.isNamedImports(names) || importClause.name || importClause.isTypeOnly)
    return false;
  const [defineConfig] = names.elements;
  if (
    names.elements.length !== 1 ||
    defineConfig.isTypeOnly ||
    defineConfig.propertyName ||
    defineConfig.name.text !== 'defineConfig'
  )
    return false;
  const call = config.expression;
  return (
    ts.isCallExpression(call) &&
    ts.isIdentifier(call.expression) &&
    call.expression.text === 'defineConfig' &&
    call.arguments.length === 1 &&
    literalObject(call.arguments[0], { test: node => literalObject(node, testOptions) })
  );
}
