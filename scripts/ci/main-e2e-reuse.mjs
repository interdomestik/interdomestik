import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decideMainE2eReuse, normalizeReuseDecision } from './main-e2e-reuse-core.mjs';
import { collectGitHubEvidence } from './main-e2e-reuse-github.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SOURCE_PATHS = {
  ciWorkflow: '.github/workflows/ci.yml',
  prWorkflow: '.github/workflows/e2e-pr.yml',
  laneSource: 'scripts/run-e2e-lane.mjs',
};
function triggerIsPullRequestOnly(source) {
  const block = /^on:\n([\s\S]*?)^concurrency:/mu.exec(source)?.[1] ?? '';
  const triggers = [...block.matchAll(/^  ([a-zA-Z0-9_-]+):/gmu)].map(match => match[1]);
  return triggers.length === 1 && triggers[0] === 'pull_request';
}
function jobBlock(source, jobName, nextJobName) {
  const start = source.indexOf(`  ${jobName}:`);
  const end = source.indexOf(`\n  ${nextJobName}:`, start + 1);
  return start >= 0 ? source.slice(start, end >= 0 ? end : undefined) : '';
}
function checkoutUsesPullRequestHead(source) {
  const runner = jobBlock(source, 'e2e-runner', 'e2e');
  const expression = /\bref:\s*\$\{\{\s*([^}\n]+?)\s*\}\}/u.exec(runner)?.[1]?.trim();
  return (
    triggerIsPullRequestOnly(source) &&
    (expression === 'github.event.pull_request.head.sha' ||
      expression === 'github.event.pull_request.head.sha || github.sha')
  );
}
function lane(source, name) {
  const constants = new Map(
    [...source.matchAll(/const\s+(\w+)\s*=\s*'--project=([^']+)'/gu)].map(match => [
      match[1],
      match[2],
    ])
  );
  const definition = new RegExp(
    `\\b${name}:\\s*gateLane\\(\\[([^\\]]+)\\],\\s*(true|false)\\)`,
    'u'
  ).exec(source);
  if (!definition) return { projects: [], shared: false };
  const projects = definition[1]
    .split(',')
    .map(value => constants.get(value.trim()))
    .filter(Boolean);
  return {
    projects,
    shared:
      definition[2] === 'true' && projects.length > 0 && projects.length === new Set(projects).size,
  };
}
function databaseDefault(source) {
  return /DATABASE_URL:\s*\$\{\{\s*secrets\.E2E_DATABASE_URL\s*\|\|\s*'([^']+)'\s*\}\}/u.exec(
    source
  )?.[1];
}
function stepBlock(source, name) {
  const start = source.indexOf(`- name: ${name}`);
  const end = source.indexOf('\n      - name:', start + 1);
  return start >= 0 ? source.slice(start, end >= 0 ? end : undefined) : '';
}
function usesWorkflowDatabase(block, command) {
  return (
    block.includes('E2E_DATABASE_URL: ${{ env.DATABASE_URL }}') &&
    block.includes('E2E_DATABASE_URL_RLS: ${{ env.DATABASE_URL }}') &&
    block.includes(`run: ${command}`)
  );
}
function usesCorrectedPostgres(block) {
  return /image: postgres:16[\s\S]*POSTGRES_USER: postgres[\s\S]*POSTGRES_DB: interdomestik_test[\s\S]*- 5432:5432[\s\S]*pg_isready -U postgres -d interdomestik_test/u.test(
    block
  );
}
export function inspectRepositoryParity({ ciWorkflow, prWorkflow, laneSource }) {
  const main = lane(laneSource, 'gate');
  const pr = lane(laneSource, 'pr');
  const mainProjects = new Set(main.projects);
  const prProjects = new Set(pr.projects);
  const ciDatabase = databaseDefault(ciWorkflow);
  const prDatabase = databaseDefault(prWorkflow);
  return {
    checkoutHead: checkoutUsesPullRequestHead(prWorkflow),
    projectSuperset:
      mainProjects.size > 0 &&
      prProjects.size > mainProjects.size &&
      [...mainProjects].every(project => prProjects.has(project)),
    sharedFlags: main.shared && pr.shared,
    databaseSubstrate:
      Boolean(ciDatabase) &&
      ciDatabase === prDatabase &&
      usesCorrectedPostgres(jobBlock(ciWorkflow, 'e2e-gate', '__last_job__')) &&
      usesCorrectedPostgres(jobBlock(prWorkflow, 'e2e-runner', 'e2e')) &&
      usesWorkflowDatabase(stepBlock(ciWorkflow, 'E2E Gate Suite'), 'pnpm e2e:gate') &&
      usesWorkflowDatabase(stepBlock(prWorkflow, 'Run PR E2E Gate'), 'pnpm e2e:gate:pr'),
  };
}
function defaultGit(revision) {
  return execFileSync('git', ['rev-parse', revision], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
}
export async function resolveMainE2eReuse(env, dependencies = {}) {
  const reject = normalizeReuseDecision(null);
  try {
    const git = dependencies.git ?? defaultGit;
    const readFile =
      dependencies.readFile ?? (value => readFileSync(path.join(root, value), 'utf8'));
    const collectEvidence = dependencies.collectEvidence ?? collectGitHubEvidence;
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
    const inputs = Object.fromEntries(
      Object.entries(SOURCE_PATHS).map(([key, value]) => [key, readFile(value)])
    );
    const parity = inspectRepositoryParity(inputs);
    if (!Object.values(parity).every(Boolean)) return reject;
    const remote = await collectEvidence({
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
