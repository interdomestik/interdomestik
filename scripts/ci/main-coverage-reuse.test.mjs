import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import test from 'node:test';
import yaml from 'js-yaml';
import { coverageInputIdentity, readPnpmIdentity } from './coverage-input-identity.mjs';
import { decideMainCoverageReuse } from './main-e2e-reuse-core.mjs';
import {
  reusableEvidence,
  strictSchemaRejectionCases,
  MAIN_SHA,
  NOW_MS,
  REPOSITORY,
  TREE_SHA,
} from './main-e2e-reuse-fixture.mjs';
import { inspectCoverageParity, resolveMainCoverageReuse } from './main-coverage-reuse.mjs';

const source = readFileSync(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8');
const REJECT = { reuse: false, reason: 'evidence_not_exact' };
function inputs() {
  return {
    tree: TREE_SHA,
    node: 'v24.7.0',
    pnpm: '10.28.2',
    pnpmSha256: 'f'.repeat(64),
    packageManager: 'pnpm@10.28.2',
    env: {
      RUNNER_OS: 'Linux',
      RUNNER_ARCH: 'X64',
      ImageOS: 'ubuntu24',
      ImageVersion: '20260906.1.0',
      CI: 'true',
      DATABASE_URL: 'postgresql://localhost/test',
      BETTER_AUTH_SECRET: 'test-secret',
      UPSTASH_REDIS_REST_URL: 'http://localhost:8080',
      TURBO_TOKEN: '',
    },
  };
}
const identity = coverageInputIdentity(inputs());
test('pnpm identity invokes the absolute entrypoint without PATH lookup', () => {
  const directory = mkdtempSync(`${tmpdir()}/coverage-pnpm-`);
  const previous = process.env.PATH;
  try {
    writeFileSync(`${directory}/pnpm`, "process.stdout.write('10.28.2');\n");
    process.env.PATH = directory;
    const result = readPnpmIdentity({ PNPM_HOME: directory });
    assert.equal(result.pnpm, '10.28.2');
    assert.match(result.pnpmSha256, /^[0-9a-f]{64}$/u);
    assert.throws(() => readPnpmIdentity({ PNPM_HOME: 'relative' }), /Absolute/u);
    writeFileSync(`${directory}/pnpm`, "process.stdout.write('10.28.2'); // changed\n");
    assert.notEqual(readPnpmIdentity({ PNPM_HOME: directory }).pnpmSha256, result.pnpmSha256);
  } finally {
    process.env.PATH = previous;
    rmSync(directory, { recursive: true, force: true });
  }
});
function evidence() {
  const value = reusableEvidence();
  value.identity = identity;
  value.parity = { checkoutEvent: true, commandChain: true };
  const candidate = value.candidates[0];
  candidate.run.path = '.github/workflows/ci.yml';
  candidate.jobs[0].name = 'unit';
  candidate.jobs[0].steps = ['Coverage Gate', `Coverage evidence ${identity}`].map(name => ({
    name,
    status: 'completed',
    conclusion: 'success',
  }));
  return value;
}
test('coverage reuses only provider-bound exact execution evidence', () => {
  assert.deepEqual(decideMainCoverageReuse(evidence()), {
    reuse: true,
    reason: 'exact_pr_evidence',
  });
  // A PR merge tree can include base changes absent from the source branch.
  // The successful measured identity binds the actual tested tree to main.
  const merged = evidence();
  merged.headCommit.commit.tree.sha = 'd'.repeat(40);
  assert.equal(decideMainCoverageReuse(merged).reuse, true);
});
test('coverage rejects missing, skipped, failed, duplicated and mismatched proof steps', () => {
  const mutations = [
    value => {
      value.identity = '0'.repeat(64);
    },
    value => {
      value.identity = '';
    },
    value => {
      value.parity.checkoutEvent = false;
    },
    value => {
      value.candidates[0].run.path = '.github/workflows/e2e-pr.yml';
    },
    value => {
      value.candidates[0].run.event = 'push';
    },
    value => {
      value.candidates[0].run.conclusion = 'failure';
    },
    value => {
      value.candidates[0].jobs[0].conclusion = 'failure';
    },
    value => {
      value.candidates[0].jobs[0].steps.pop();
    },
    value => {
      value.candidates[0].jobs[0].steps[0].conclusion = 'skipped';
    },
    value => {
      value.candidates[0].jobs[0].steps[1].conclusion = 'failure';
    },
    value => {
      value.candidates[0].jobs[0].steps.push(value.candidates[0].jobs[0].steps[1]);
    },
    value => {
      value.candidates[0].jobs.push(value.candidates[0].jobs[0]);
    },
    value => {
      value.context.nowMs += 25 * 60 * 60 * 1000;
    },
    value => {
      value.candidates[0].run.head_repository.id++;
    },
    value => {
      value.pullRequests[0].merge_commit_sha = 'e'.repeat(40);
    },
    value => {
      value.candidates[0].fallbackPullRequests = [];
    },
    ...strictSchemaRejectionCases.map(([, mutate]) => mutate),
  ];
  for (const mutate of mutations) {
    const value = evidence();
    mutate(value);
    assert.deepEqual(decideMainCoverageReuse(value), REJECT, mutate.toString());
  }
});
test('coverage identity invalidates source, runtime, runner and test-environment drift', () => {
  for (const mutate of [
    value => {
      value.tree = 'd'.repeat(40);
    },
    value => {
      value.node = 'v24.8.0';
    },
    value => {
      value.pnpm = '10.28.3';
      value.packageManager = 'pnpm@10.28.3';
    },
    value => {
      value.env.ImageVersion = '20260907.1.0';
    },
    value => {
      value.env.DATABASE_URL += '-other';
    },
    value => {
      value.env.BETTER_AUTH_SECRET += '-rotated';
    },
    value => {
      value.env.NODE_OPTIONS = '--max-old-space-size=4096';
    },
    value => {
      value.env.NEXT_PUBLIC_FEATURE = '1';
    },
  ]) {
    const value = inputs();
    mutate(value);
    assert.notEqual(coverageInputIdentity(value), identity);
  }
  const unrelated = inputs();
  unrelated.env.GITHUB_TOKEN = 'never-published';
  unrelated.env.GITHUB_SHA = MAIN_SHA;
  assert.equal(coverageInputIdentity(unrelated), identity);
  for (const mutate of [
    value => {
      delete value.env.ImageVersion;
    },
    value => {
      value.node = 'v22.1.0';
    },
    value => {
      value.pnpm = '9.0.0';
    },
    value => {
      value.tree = '';
    },
  ]) {
    const value = inputs();
    mutate(value);
    assert.throws(() => coverageInputIdentity(value), /identity unavailable/u);
  }
});
test('workflow keeps fallback coverage, merge-ref checkout and separate release tests', () => {
  assert.deepEqual(inspectCoverageParity(source), { checkoutEvent: true, commandChain: true });
  const unit = yaml.load(source).jobs.unit;
  const resolver = unit.steps.find(step => step.id === 'main_coverage_reuse');
  assert.equal(resolver.if, undefined);
  assert.equal(resolver['continue-on-error'], true);
  const release = unit.steps.find(step => step.name === 'Release Gate Unit Tests');
  assert.equal(release.run, 'pnpm test:release-gate');
  assert.equal(release.if, undefined);
  assert.equal(unit.env.TURBO_TOKEN, '');
  assert.equal(unit.env.INTERDOMESTIK_TURBO_REMOTE_CACHE_READ_ONLY, '1');
});
test('step-only overrides cannot evade measured coverage identity', () => {
  const global = yaml.load(source);
  global.defaults = { run: { shell: 'sh', 'working-directory': 'apps/web' } };
  assert.equal(inspectCoverageParity(yaml.dump(global)).commandChain, false);
  for (const name of ['Coverage Gate', 'Measure and resolve coverage reuse']) {
    const workflow = yaml.load(source);
    workflow.jobs.unit.steps.find(step => step.name === name).env = {
      NODE_OPTIONS: '--different',
      DATABASE_URL: 'other',
    };
    assert.equal(inspectCoverageParity(yaml.dump(workflow)).commandChain, false);
  }
  const workflow = yaml.load(source);
  workflow.jobs.unit.steps.find(step =>
    step.name?.startsWith('Coverage evidence')
  ).env.DATABASE_URL = 'other';
  assert.equal(inspectCoverageParity(yaml.dump(workflow)).commandChain, false);
  const value = inputs();
  value.environmentKeys = ['FEATURE_FLAG'];
  value.env.FEATURE_FLAG = 'on';
  const before = coverageInputIdentity(value);
  value.env.FEATURE_FLAG = 'off';
  assert.notEqual(coverageInputIdentity(value), before);
});
test('resolver safely falls back on context, parity, identity and API failures', async () => {
  const env = {
    GITHUB_EVENT_NAME: 'push',
    GITHUB_REF: 'refs/heads/main',
    GITHUB_REPOSITORY: REPOSITORY,
    GITHUB_SHA: MAIN_SHA,
    GITHUB_TOKEN: 'test',
  };
  let requests = 0;
  const dependencies = {
    source,
    nowMs: NOW_MS,
    git: revision => (revision === 'HEAD' ? MAIN_SHA : TREE_SHA),
    identity: () => identity,
  };
  // Remote input cannot supply local identity, parity or context in production;
  // the collector returns these three provider-owned fields only.
  dependencies.collectEvidence = async options => {
    requests++;
    assert.equal(options.workflowPath, '.github/workflows/ci.yml');
    const { pullRequests, headCommit, candidates } = evidence();
    return { pullRequests, headCommit, candidates };
  };
  assert.equal((await resolveMainCoverageReuse(env, dependencies)).reuse, true);
  const before = requests;
  assert.deepEqual(
    await resolveMainCoverageReuse({ ...env, GITHUB_EVENT_NAME: 'pull_request' }, dependencies),
    REJECT
  );
  assert.deepEqual(
    await resolveMainCoverageReuse(env, {
      ...dependencies,
      source: source.replace('run: pnpm coverage:gate', 'run: true'),
    }),
    REJECT
  );
  assert.deepEqual(
    await resolveMainCoverageReuse(env, {
      ...dependencies,
      identity: () => {
        throw new Error('unavailable');
      },
    }),
    REJECT
  );
  assert.equal(requests, before);
  assert.deepEqual(
    await resolveMainCoverageReuse(env, {
      ...dependencies,
      collectEvidence: async () => {
        throw new Error('token must not leak');
      },
    }),
    REJECT
  );
});
