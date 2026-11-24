import { spawnSync } from 'node:child_process';
import { join, matchesGlob, relative } from 'node:path';
import ts from 'typescript';

const gateCommand = 'pnpm test:coverage && node scripts/ci/coverage-gate.mjs --min-lines 60';
const cleanupCommand = 'node scripts/ci/clean-coverage-artifacts.mjs';
const coverageInvocation =
  /^pnpm --filter (@interdomestik\/[\w*-]+) (exec vitest run|test:unit) (.+)$/u;

function unconditional(condition) {
  return (
    condition === undefined ||
    condition === true ||
    (typeof condition === 'string' &&
      condition.replace(/^\$\{\{(.*)\}\}$/u, '$1').trim() === 'true')
  );
}

function jobRuns(jobs, name, ancestors = new Set()) {
  if (!Object.hasOwn(jobs, name) || ancestors.has(name)) return false;
  const job = jobs[name];
  if (
    !job ||
    !unconditional(job.if) ||
    job.strategy !== undefined ||
    !Array.isArray(job.steps) ||
    !job.steps.length
  )
    return false;
  const prerequisites = typeof job.needs === 'string' ? [job.needs] : job.needs;
  if (prerequisites === undefined) return true;
  const path = new Set([...ancestors, name]);
  return (
    Array.isArray(prerequisites) &&
    prerequisites.every(needed => typeof needed === 'string' && jobRuns(jobs, needed, path))
  );
}

function vitestImports(syntax) {
  const imports = new Map();
  for (const statement of syntax.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    if (statement.moduleSpecifier.text !== 'vitest') return null;
    const names = statement.importClause?.namedBindings;
    if (!names || !ts.isNamedImports(names) || statement.importClause.name) return null;
    for (const { name, propertyName, isTypeOnly } of names.elements) {
      if (!isTypeOnly && !statement.importClause.isTypeOnly) {
        if (imports.has(name.text)) return null;
        imports.set(name.text, (propertyName ?? name).text);
      }
    }
  }
  return imports;
}

function memberCall(call, method) {
  if (!ts.isCallExpression(call) || call.questionDotToken) return undefined;
  const member = call.expression;
  if (
    ts.isPropertyAccessExpression(member) &&
    !member.questionDotToken &&
    member.name.text === method
  )
    return member.expression;
}

function isEmptyDatabaseMock(call, imports) {
  const receiver = memberCall(call, 'mock');
  if (!receiver || !ts.isIdentifier(receiver) || imports.get(receiver.text) !== 'vi') return false;
  const [module, factory] = call.arguments;
  return (
    call.arguments.length === 2 &&
    ts.isStringLiteralLike(module) &&
    module.text === '@interdomestik/database' &&
    ts.isArrowFunction(factory) &&
    !factory.parameters.length &&
    ts.isParenthesizedExpression(factory.body) &&
    ts.isObjectLiteralExpression(factory.body.expression) &&
    !factory.body.expression.properties.length
  );
}

function isLiteralAssertion(expression, imports) {
  const assertion = memberCall(expression, 'toBe');
  return (
    assertion &&
    ts.isCallExpression(assertion) &&
    !assertion.questionDotToken &&
    ts.isIdentifier(assertion.expression) &&
    imports.get(assertion.expression.text) === 'expect' &&
    assertion.arguments.length === 1 &&
    expression.arguments.length === 1 &&
    ts.isLiteralExpression(assertion.arguments[0]) &&
    ts.isLiteralExpression(expression.arguments[0])
  );
}

// Recognize only callback bodies that cannot delegate to code with access to Vitest runtime state.
function isDirectCase(body, imports) {
  if (!ts.isBlock(body)) return isLiteralAssertion(body, imports);
  return body.statements.every(
    statement =>
      ts.isExpressionStatement(statement) && isLiteralAssertion(statement.expression, imports)
  );
}

// Follow only direct Vitest declarations. Delegated registration and conditional suite
// control flow do not have a statically known set of runnable cases.
function registeredCases(statements, imports, databaseMock) {
  let cases = 0;
  for (const statement of statements) {
    if (!ts.isExpressionStatement(statement) || !ts.isCallExpression(statement.expression))
      return null;
    const call = statement.expression;
    if (call === databaseMock) continue;
    if (!ts.isIdentifier(call.expression) || call.questionDotToken) return null;
    const name = imports.get(call.expression.text);
    const [label, callback] = call.arguments;
    if (
      call.arguments.length !== 2 ||
      !ts.isStringLiteralLike(label) ||
      !(ts.isArrowFunction(callback) || ts.isFunctionExpression(callback)) ||
      callback.parameters.length
    )
      return null;
    if ((name === 'it' || name === 'test') && isDirectCase(callback.body, imports)) {
      cases += 1;
    } else if (name === 'describe' && ts.isBlock(callback.body)) {
      const nested = registeredCases(callback.body.statements, imports);
      if (!nested) return null;
      cases += nested;
    } else {
      return null;
    }
  }
  return cases;
}

function hasUnconditionalCoverageSuite(file, source) {
  const syntax = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  if (syntax.parseDiagnostics.length) return false;
  const imports = vitestImports(syntax);
  if (!imports) return false;
  const statements = syntax.statements.filter(statement => !ts.isImportDeclaration(statement));
  const mock = statements.find(
    statement =>
      ts.isExpressionStatement(statement) && isEmptyDatabaseMock(statement.expression, imports)
  );
  return Boolean(mock && registeredCases(statements, imports, mock.expression) > 0);
}

function readInvocations(coverage, scripts) {
  if (coverage.run !== 'pnpm coverage:gate' || scripts['coverage:gate'] !== gateCommand) return [];
  const [cleanup, ...commands] = (scripts['test:coverage'] ?? '').split(' && ');
  if (cleanup !== cleanupCommand) return [];
  const invocations = [];
  for (const command of commands) {
    const match = coverageInvocation.exec(command);
    if (!match) return [];
    const [, filter, runner, args] = match;
    const options = args.split(' ');
    const listOptions = options.filter(option => !option.startsWith('--coverage.'));
    if (!listOptions.includes('--coverage')) return [];
    const vitestOptions = listOptions.filter(option => option !== '--coverage');
    if (vitestOptions.some(option => !/^--(?:pool|testTimeout|maxWorkers)=[\w-]+$/u.test(option)))
      return [];
    invocations.push({ filter, runner, vitestOptions });
  }
  return invocations;
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

export function coverageTargets(root, workflow, scripts, read, files) {
  const { jobs } = workflow;
  if (!files.length || workflow.defaults !== undefined || !jobRuns(jobs, 'unit')) return [];
  const gates = jobs.unit.steps.filter(step => step?.name === 'Coverage Gate');
  const unit = jobs.unit;
  if (gates.length !== 1 || unit.defaults !== undefined || unit['continue-on-error']) return [];
  const [gate] = gates;
  if (
    !unconditional(gate.if) ||
    gate['continue-on-error'] ||
    gate['working-directory'] !== undefined ||
    gate.shell !== undefined
  )
    return [];
  const invocations = readInvocations(gate, scripts);
  if (!invocations.length) return [];
  const selected = new Set();
  const proven = files.filter(file => hasUnconditionalCoverageSuite(file, read(file)));
  for (const [project, candidates] of vitestProjects(proven)) {
    const manifest = JSON.parse(read(`${project}/package.json`));
    for (const { filter, runner, vitestOptions } of invocations) {
      if (!matchesGlob(manifest.name, filter)) continue;
      if (runner === 'test:unit' && manifest.scripts?.['test:unit'] !== 'vitest run') {
        continue;
      }
      let listed;
      try {
        listed = listVitestFiles(root, project, candidates, vitestOptions);
      } catch {
        continue; // The advisory selector still needs to confirm these files independently.
      }
      for (const file of candidates) {
        if (listed.has(file)) selected.add(file);
      }
    }
  }
  return [...selected];
}
