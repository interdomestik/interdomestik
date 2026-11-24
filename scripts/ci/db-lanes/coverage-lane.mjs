import { spawnSync } from 'node:child_process';
import { join, matchesGlob, relative } from 'node:path';

const gateCommand = 'pnpm test:coverage && node scripts/ci/coverage-gate.mjs --min-lines 60';
const cleanupCommand = 'node scripts/ci/clean-coverage-artifacts.mjs';
const coverageInvocation =
  /^pnpm --filter (@interdomestik\/[\w*-]+) (exec vitest run|test:unit) (.+)$/u;

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

function listVitestFiles(root, project, candidates, options) {
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
  if (run.status !== 0) throw new Error(`Cannot list coverage tests in ${project}`);
  let listing;
  try {
    listing = JSON.parse(run.stdout);
  } catch {
    throw new Error(`Invalid Vitest coverage listing in ${project}`);
  }
  if (!Array.isArray(listing) || listing.some(entry => typeof entry?.file !== 'string')) {
    throw new Error(`Invalid Vitest coverage listing in ${project}`);
  }
  return new Set(listing.map(({ file }) => relative(root, file)));
}

export function coverageTargets(root, unit, scripts, read, files) {
  const gate = unit.steps.find(step => step.name === 'Coverage Gate');
  const invocations = readInvocations(gate, scripts);
  const projects = Map.groupBy(files, file => file.split('/').slice(0, 2).join('/'));
  const selected = new Set();
  for (const [project, candidates] of projects) {
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
