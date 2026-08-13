import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decideMainE2eReuse, normalizeReuseDecision } from './main-e2e-reuse-core.mjs';
import { collectGitHubEvidence, readLocalGitObjectId } from './main-e2e-reuse-github.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const GATE_HELPER_CONTRACTS = [
  'playwrightReportArgs(process.env.PW_EVIDENCE_LANE)',
  "PW_FAST_GATES:'1'",
  "['--max-failures=1',...reportArgs]",
  "['--workers=1',...strictArgs]",
  "['e2e/gate',...strictWorkers]",
  'gatekeeper:true,state,env:fastEnv,playwrightArgs:[...gateArgs,...projects]',
];
function sourceBlock(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  if (start < 0) return '';
  const end = source.indexOf(endMarker, start + 1);
  return source.slice(start, end < 0 ? undefined : end);
}
function checkoutUsesPullRequestHead(source) {
  const triggerBlock = source.slice(source.indexOf('on:\n'), source.indexOf('concurrency:'));
  const triggers = [...triggerBlock.matchAll(/^ {2}([a-zA-Z0-9_-]+):/gmu)];
  const lines = new Set(
    sourceBlock(source, '  e2e-runner:', '\n  e2e:')
      .split('\n')
      .map(value => value.trim())
  );
  return (
    triggers.length === 1 &&
    triggers[0][1] === 'pull_request' &&
    (lines.has('ref: ${{ github.event.pull_request.head.sha }}') ||
      lines.has('ref: ${{ github.event.pull_request.head.sha || github.sha }}'))
  );
}
function lane(source, name) {
  const constants = Object.fromEntries(
    [...source.matchAll(/const\s+(\w+)\s*=\s*'--project=([^']+)'/gu)].map(match => match.slice(1))
  );
  const pattern = new RegExp(
    String.raw`\b${name}:\s*gateLane\(\[([^\]]+)\],\s*(true|false)\)`,
    'u'
  );
  const definition = pattern.exec(source);
  if (!definition) return { projects: [], shared: false };
  const projects = definition[1].split(',').map(value => constants[value.trim()]);
  if (projects.some(value => !value) || projects.length !== new Set(projects).size)
    return { projects: [], shared: false };
  return { projects, shared: definition[2] === 'true' && projects.length > 0 };
}
function hasExactCommandChain(packageJson, laneSource) {
  try {
    const scripts = JSON.parse(packageJson)?.scripts;
    const compactSource = laneSource.replace(/\s+/gu, '');
    return (
      scripts?.['e2e:gate'] === 'node scripts/run-e2e-lane.mjs gate' &&
      scripts?.['e2e:gate:pr'] === 'node scripts/run-e2e-lane.mjs pr' &&
      GATE_HELPER_CONTRACTS.every(contract => compactSource.includes(contract))
    );
  } catch {
    return false;
  }
}
const databaseDefault = source => /DATABASE_URL:[^\n]*\|\|\s*'([^']+)'/u.exec(source)?.[1];
const stepBlock = (source, name) => sourceBlock(source, `- name: ${name}`, '\n      - name:');
function usesWorkflowDatabase(block, command) {
  return (
    block.includes('E2E_DATABASE_URL: ${{ env.DATABASE_URL }}') &&
    block.includes('E2E_DATABASE_URL_RLS: ${{ env.DATABASE_URL }}') &&
    block.includes(`run: ${command}`)
  );
}
function usesCorrectedPostgres(block) {
  return [
    'postgres:16',
    'POSTGRES_USER: postgres',
    'POSTGRES_DB: interdomestik_test',
    '5432:5432',
    'pg_isready -U postgres -d interdomestik_test',
  ].every(value => block.includes(value));
}
export function inspectRepositoryParity({ ciWorkflow, prWorkflow, laneSource, packageJson }) {
  const main = lane(laneSource, 'gate');
  const pr = lane(laneSource, 'pr');
  const mainProjects = new Set(main.projects);
  const prProjects = new Set(pr.projects);
  return {
    checkoutHead: checkoutUsesPullRequestHead(prWorkflow),
    projectSuperset:
      mainProjects.size > 0 &&
      prProjects.size > mainProjects.size &&
      [...mainProjects].every(project => prProjects.has(project)),
    sharedFlags: main.shared && pr.shared,
    databaseSubstrate:
      Boolean(databaseDefault(ciWorkflow)) &&
      databaseDefault(ciWorkflow) === databaseDefault(prWorkflow) &&
      usesCorrectedPostgres(sourceBlock(ciWorkflow, '  e2e-gate:', '\n  __last_job__:')) &&
      usesCorrectedPostgres(sourceBlock(prWorkflow, '  e2e-runner:', '\n  e2e:')) &&
      usesWorkflowDatabase(stepBlock(ciWorkflow, 'E2E Gate Suite'), 'pnpm e2e:gate') &&
      usesWorkflowDatabase(stepBlock(prWorkflow, 'Run PR E2E Gate'), 'pnpm e2e:gate:pr'),
    commandChain: hasExactCommandChain(packageJson, laneSource),
  };
}
export async function resolveMainE2eReuse(env, dependencies = {}) {
  const reject = normalizeReuseDecision(null);
  try {
    const git = dependencies.git ?? (revision => readLocalGitObjectId(root, revision));
    const readFile =
      dependencies.readFile ?? (value => readFileSync(path.join(root, value), 'utf8'));
    const context = {
      eventName: env.GITHUB_EVENT_NAME,
      ref: env.GITHUB_REF,
      repository: env.GITHUB_REPOSITORY,
      githubSha: env.GITHUB_SHA,
      nowMs: dependencies.nowMs ?? Date.now(),
    };
    const local = { headSha: git('HEAD'), treeSha: git('HEAD^{tree}') };
    if (
      context.eventName !== 'push' ||
      context.ref !== 'refs/heads/main' ||
      context.repository !== 'interdomestik/interdomestik' ||
      local.headSha !== context.githubSha
    ) {
      return reject;
    }
    const inputs = {
      ciWorkflow: readFile('.github/workflows/ci.yml'),
      prWorkflow: readFile('.github/workflows/e2e-pr.yml'),
      laneSource: readFile('scripts/run-e2e-lane.mjs'),
      packageJson: readFile('package.json'),
    };
    const parity = inspectRepositoryParity(inputs);
    if (!Object.values(parity).every(value => value === true)) return reject;
    const remote = await (dependencies.collectEvidence ?? collectGitHubEvidence)({
      repositoryFullName: context.repository,
      githubSha: context.githubSha,
      token: env.GITHUB_TOKEN,
    });
    return normalizeReuseDecision(decideMainE2eReuse({ context, local, parity, ...remote }));
  } catch {
    return reject;
  }
}
export function formatReuseDecision(value) {
  const decision = normalizeReuseDecision(value);
  return `reuse=${decision.reuse}\nreason=${decision.reason}\n`;
}
if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  process.stdout.write(formatReuseDecision(await resolveMainE2eReuse(process.env)));
}
