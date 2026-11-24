import { spawnSync } from 'node:child_process';
import { join, matchesGlob, relative } from 'node:path';
import ts from 'typescript';
import { inspectCoverageParity } from '../main-coverage-reuse.mjs';

const gateCommand = 'pnpm test:coverage && node scripts/ci/coverage-gate.mjs --min-lines 60';
const cleanupCommand = 'node scripts/ci/clean-coverage-artifacts.mjs';
const coverageInvocation =
  /^pnpm --filter (@interdomestik\/[\w*-]+) (exec vitest run|test:unit) (.+)$/u;
const broadJob = "needs.validation-surface.outputs.run_broad == 'true'";

function unconditional(condition) {
  return (
    condition === undefined ||
    condition === true ||
    (typeof condition === 'string' &&
      condition.replace(/^\$\{\{(.*)\}\}$/u, '$1').trim() === 'true')
  );
}

function coverageRuns(unit, gate, read) {
  if (!gate) return false;
  const requires = [unit.needs ?? []].flat();
  const needsValidation = requires.length === 1 && requires[0] === 'validation-surface';
  if (requires.length && !needsValidation) return false;
  if (!unconditional(unit.if) && !(needsValidation && unit.if === broadJob)) return false;
  if (unconditional(gate.if)) return true;
  // The checked reuse chain falls back to fresh coverage on pull requests.
  const { checkoutEvent, commandChain } = inspectCoverageParity(read('.github/workflows/ci.yml'));
  return checkoutEvent && commandChain;
}

function vitestImports(syntax) {
  const imports = new Map();
  for (const statement of syntax.statements) {
    if (!ts.isImportDeclaration(statement) || statement.moduleSpecifier.text !== 'vitest') continue;
    const names = statement.importClause?.namedBindings;
    if (!names || !ts.isNamedImports(names)) continue;
    for (const { name, propertyName, isTypeOnly } of names.elements) {
      if (!isTypeOnly && !statement.importClause.isTypeOnly) {
        imports.set(name.text, (propertyName ?? name).text);
      }
    }
  }
  return imports;
}

function isViCall(call, imports, method) {
  if (!call || !ts.isCallExpression(call) || call.questionDotToken) return false;
  const member = call.expression;
  return (
    ts.isPropertyAccessExpression(member) &&
    !member.questionDotToken &&
    ts.isIdentifier(member.expression) &&
    imports.get(member.expression.text) === 'vi' &&
    member.name.text === method
  );
}

const isCallback = node => node && (ts.isArrowFunction(node) || ts.isFunctionExpression(node));
const hooks = new Set(['beforeAll', 'beforeEach', 'afterAll', 'afterEach']);

// Follow only direct Vitest declarations. Delegated registration and conditional suite
// control flow do not have a statically known set of runnable cases.
function registeredCases(statements, imports) {
  let cases = 0;
  for (const statement of statements) {
    if (ts.isImportDeclaration(statement) && statement.importClause) continue;
    if (ts.isFunctionDeclaration(statement) && !imports.has(statement.name?.text)) continue;
    if (
      ts.isVariableStatement(statement) &&
      statement.declarationList.declarations.every(
        ({ name, initializer }) =>
          ts.isIdentifier(name) &&
          !imports.has(name.text) &&
          (isViCall(initializer, imports, 'hoisted') ||
            (initializer && ts.isLiteralExpression(initializer)))
      )
    )
      continue;
    if (!ts.isExpressionStatement(statement) || !ts.isCallExpression(statement.expression))
      return null;
    const call = statement.expression;
    if (isViCall(call, imports, 'mock')) continue;
    if (!ts.isIdentifier(call.expression) || call.questionDotToken) return null;
    const name = imports.get(call.expression.text);
    const [label, callback] = call.arguments;
    if (hooks.has(name) && call.arguments.length === 1 && isCallback(label)) continue;
    if (call.arguments.length !== 2 || !ts.isStringLiteralLike(label) || !isCallback(callback))
      return null;
    if (name === 'it' || name === 'test') {
      cases += 1;
    } else if (
      name === 'describe' &&
      ts.isBlock(callback.body) &&
      callback.parameters.length === 0
    ) {
      const nested = registeredCases(callback.body.statements, imports);
      if (nested === null) return null;
      cases += nested;
    } else {
      return null;
    }
  }
  return cases;
}

export function hasUnconditionalCoverageSuite(file, source) {
  const syntax = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  if (syntax.parseDiagnostics.length) return false;
  const imports = vitestImports(syntax);
  const mocksDatabase = syntax.statements.some(statement => {
    if (!ts.isExpressionStatement(statement) || !isViCall(statement.expression, imports, 'mock')) {
      return false;
    }
    const [module] = statement.expression.arguments;
    return module && ts.isStringLiteralLike(module) && module.text === '@interdomestik/database';
  });
  return mocksDatabase && registeredCases(syntax.statements, imports) > 0;
}

function readInvocations(coverage, scripts) {
  if (coverage?.run !== 'pnpm coverage:gate' || scripts['coverage:gate'] !== gateCommand) {
    throw new Error('Cannot inventory the existing coverage gate');
  }
  const [cleanup, ...commands] = (scripts['test:coverage'] ?? '').split(' && ');
  if (cleanup !== cleanupCommand || !commands.length) {
    throw new Error('Cannot inventory the existing coverage commands');
  }
  return commands.map(command => {
    const match = coverageInvocation.exec(command);
    if (!match) throw new Error('Unsupported coverage invocation');
    const [, filter, runner, args] = match;
    const options = args.split(' ');
    const listOptions = options.filter(option => !option.startsWith('--coverage.'));
    if (!listOptions.includes('--coverage')) throw new Error('Coverage flag is missing');
    const vitestOptions = listOptions.filter(option => option !== '--coverage');
    if (vitestOptions.some(option => !/^--(?:pool|testTimeout|maxWorkers)=[\w-]+$/u.test(option))) {
      throw new Error('Unsupported coverage test selector');
    }
    return { filter, runner, vitestOptions };
  });
}

export const vitestProjects = files =>
  Map.groupBy(files, file => file.split('/').slice(0, 2).join('/'));

export function listVitestFiles(root, project, candidates, options) {
  const cwd = join(root, project);
  const filters = candidates.map(file => relative(cwd, join(root, file)));
  const run = spawnSync(
    'pnpm',
    [
      'exec',
      'vitest',
      'list',
      ...filters,
      ...options,
      '--filesOnly',
      '--passWithNoTests',
      '--json',
    ],
    { cwd, encoding: 'utf8' }
  );
  if (run.status !== 0) throw new Error(`Cannot list Vitest tests in ${project}`);
  let listing;
  try {
    listing = JSON.parse(run.stdout);
  } catch {
    throw new Error(`Invalid Vitest listing in ${project}`);
  }
  if (!Array.isArray(listing) || listing.some(entry => typeof entry?.file !== 'string')) {
    throw new Error(`Invalid Vitest listing in ${project}`);
  }
  return new Set(listing.map(({ file }) => relative(root, file)));
}

export function coverageTargets(root, unit, scripts, read, files) {
  const gate = unit?.steps?.find(step => step.name === 'Coverage Gate');
  if (!coverageRuns(unit, gate, read)) return [];
  const invocations = readInvocations(gate, scripts);
  const selected = new Set();
  for (const [project, candidates] of vitestProjects(files)) {
    const manifest = JSON.parse(read(`${project}/package.json`));
    for (const { filter, runner, vitestOptions } of invocations) {
      if (!matchesGlob(manifest.name, filter)) continue;
      if (runner === 'test:unit' && manifest.scripts?.['test:unit'] !== 'vitest run') {
        throw new Error(`Unsupported coverage runner in ${project}`);
      }
      const listed = listVitestFiles(root, project, candidates, vitestOptions);
      for (const file of candidates) {
        if (listed.has(file)) selected.add(file);
      }
    }
  }
  return [...selected];
}
