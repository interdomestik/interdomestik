import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { canonicalJson, sha256 } from './slice-rehearse-core.mjs';
import { deriveEvidenceIdentityKey, evaluateEvidenceReceipts } from './slice-rehearse-evidence.mjs';
import { gitBytes } from './slice-rehearse-git-facts.mjs';
import {
  collectVerifiedEvidenceKeys,
  derivePrE2eProofIdentity,
} from './slice-rehearse-github-evidence.mjs';
import { derivePrE2eSubstrateDigest } from './slice-rehearse-repository-facts.mjs';
import {
  headSha,
  treeSha,
  workflow,
  setupAction,
  workflowDigest,
  substrateDigest,
  commands,
  writerPaths,
  now,
  pull,
  run,
  githubReader,
  collect,
} from './slice-rehearse-github-evidence-fixtures.mjs';

test('PR E2E substrate regexes use explicit indentation quantifiers', () => {
  const source = derivePrE2eSubstrateDigest.toString();
  assert.doesNotMatch(source, /\/\^ {2,}/u);
  assert.doesNotMatch(source, /\/\\n {2,}/u);
});

test('initializer and verifier share one exact-Git-blob PR E2E identity builder', () => {
  const identity = derivePrE2eProofIdentity({
    repository: '/repo',
    commitSha: headSha,
    readGitBytes: (_repository, args) =>
      args[1].endsWith(':.github/actions/setup/action.yml') ? setupAction : workflow,
  });
  assert.deepEqual(identity, { commands: [...commands].sort(), workflowDigest, substrateDigest });
});

test('collects an exact protected-workflow PR E2E receipt key from independent GitHub facts', () => {
  const result = collect();
  assert.deepEqual(result, {
    'pr-e2e': [
      {
        provider: 'github',
        key: deriveEvidenceIdentityKey({
          lane: 'pr-e2e',
          headSha,
          treeSha,
          commandDigest: sha256(canonicalJson([...commands].sort())),
          workflowDigest,
          substrateDigest,
          writerMapDigest: sha256(canonicalJson(writerPaths)),
        }),
        checkId: 88,
        runId: 77,
        completedAt: '2026-08-29T11:44:00.000Z',
      },
    ],
  });

  const identity = {
    headSha,
    treeSha,
    commandDigest: sha256(canonicalJson([...commands].sort())),
    workflowDigest,
    substrateDigest,
    writerMapDigest: sha256(canonicalJson(writerPaths)),
  };
  const decision = evaluateEvidenceReceipts({
    receipts: [
      {
        lane: 'pr-e2e',
        ...identity,
        status: 'success',
        expiresAt: '2026-08-30T00:00:00.000Z',
      },
    ],
    heavyLanes: ['pr-e2e'],
    expectedByLane: { 'pr-e2e': identity },
    verifiedEvidenceKeysByLane: result,
    dirtyWriterPaths: [],
    now,
  });
  assert.deepEqual(decision.reusableLanes, ['pr-e2e']);
  assert.deepEqual(decision.missingLanes, []);
});

test('canonicalizes command and writer ordering before deriving reusable evidence identity', () => {
  const reversedCommands = [...commands].reverse();
  const reversedWriters = ['scripts/z-last.mjs', 'scripts/a-first.mjs'];
  const canonicalWriters = [...reversedWriters].sort();
  const result = collect({
    proof: {
      commands: reversedCommands,
      workflowDigest,
      substrateDigest,
    },
    writerPaths: reversedWriters,
  });
  assert.equal(
    result['pr-e2e'][0].key,
    deriveEvidenceIdentityKey({
      lane: 'pr-e2e',
      headSha,
      treeSha,
      commandDigest: sha256(canonicalJson([...commands].sort())),
      workflowDigest,
      substrateDigest,
      writerMapDigest: sha256(canonicalJson(canonicalWriters)),
    })
  );
});

test('rejects stale, future, missing, mismatched, ambiguous, and unsuccessful evidence', () => {
  for (const updated_at of ['2026-08-27T00:00:00.000Z', '2026-08-29T12:06:00.000Z', null]) {
    assert.deepEqual(collect({ readGithub: githubReader({ runs: [run({ updated_at })] }) }), {});
  }
  assert.deepEqual(
    collect({
      proof: { commands: ['pnpm e2e:gate:pr'], workflowDigest, substrateDigest },
    }),
    {}
  );
  assert.deepEqual(collect({ readGithub: githubReader({ pulls: [pull(), pull()] }) }), {});
  assert.deepEqual(
    collect({
      readGithub: githubReader({
        jobs: [
          {
            id: 88,
            name: 'PR E2E Runner',
            status: 'completed',
            conclusion: 'failure',
            completed_at: '2026-08-29T11:44:00.000Z',
          },
        ],
      }),
    }),
    {}
  );
});

test('rejects workflow or substrate digests not anchored to protected main', () => {
  assert.deepEqual(
    collect({
      proof: { commands, workflowDigest: 'd'.repeat(64), substrateDigest },
    }),
    {}
  );
  assert.deepEqual(
    collect({
      proof: { commands, workflowDigest, substrateDigest: 'e'.repeat(64) },
    }),
    {}
  );
});

test('binds workflow and runner substrate independently at protected main and head', () => {
  const changedHeadWorkflow = Buffer.from('name: weakened PR E2E\n');
  assert.deepEqual(
    collect({
      writerPaths: [...writerPaths, '.github/workflows/e2e-pr.yml'],
      readGitBytes: (_repository, args) =>
        args[1].endsWith(':.github/actions/setup/action.yml')
          ? setupAction
          : args[1].startsWith(`${headSha}:`)
            ? changedHeadWorkflow
            : workflow,
    }),
    {}
  );
  const changedSetup = Buffer.from('name: changed setup\n');
  assert.deepEqual(
    collect({
      readGitBytes: (_repository, args) =>
        args[1].endsWith(':.github/actions/setup/action.yml') ? changedSetup : workflow,
    }),
    {}
  );
});

test('Git blob evidence preserves exact bytes as a Buffer', () => {
  const repository = mkdtempSync(join(tmpdir(), 'slice-evidence-git-bytes-'));
  try {
    execFileSync('/usr/bin/git', ['init', '-q', '-b', 'main', repository]);
    execFileSync('/usr/bin/git', ['config', 'user.email', 'harness@example.test'], {
      cwd: repository,
    });
    execFileSync('/usr/bin/git', ['config', 'user.name', 'Harness Test'], { cwd: repository });
    const expected = Buffer.from([0x00, 0xff, 0x41, 0x0a]);
    writeFileSync(join(repository, 'workflow.bin'), expected);
    execFileSync('/usr/bin/git', ['add', 'workflow.bin'], { cwd: repository });
    execFileSync('/usr/bin/git', ['commit', '-q', '-m', 'binary evidence'], { cwd: repository });

    const actual = gitBytes(repository, ['show', 'HEAD:workflow.bin']);
    assert.equal(Buffer.isBuffer(actual), true);
    assert.deepEqual(actual, expected);
  } finally {
    rmSync(repository, { recursive: true, force: true });
  }
});
