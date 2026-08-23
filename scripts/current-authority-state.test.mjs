import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  resolveCurrentAuthority,
  validateProjection,
  validateProjectionDocuments,
  writerMapDigest,
} from './current-authority-state-lib.mjs';

const cli = new URL('./current-authority-state.mjs', import.meta.url).pathname;

const paths = [
  'docs/plans/current-authority-v1.json',
  'scripts/current-authority-state.mjs',
  'scripts/current-authority-state-lib.mjs',
  'scripts/current-authority-state.test.mjs',
];

function projection() {
  return {
    schemaVersion: 1,
    programId: 'IDA-WF01-ONE-APPROVAL-DELIVERY',
    sourceMain: '0'.repeat(40),
    projectedRevision: 20,
    projectedChild: 'S3-exact-authority',
    projectedOperationSha256: durable().operationSha256,
    envelopeSha256: '2'.repeat(64),
    approvalReceiptSha256: '3'.repeat(64),
    writerPaths: paths,
    writerMapSha256: writerMapDigest(paths),
    liveDispositionRequired: 'open',
    repositoryConsumptionRule: 'merged_closed_or_terminal_failure',
    successorAfterHealthCleanup: 'S4A-terminal-delivery',
  };
}

function durable(overrides = {}) {
  const state = {
    schemaVersion: 1,
    programId: 'IDA-WF01-ONE-APPROVAL-DELIVERY',
    revision: 20,
    status: 'active',
    childId: 'S3-exact-authority',
    runtimeAuthorized: true,
    successorsBlocked: false,
    envelopeSha256: '2'.repeat(64),
    approvalReceiptSha256: '3'.repeat(64),
    boundary: { kind: 'local', postimageSha256: '8'.repeat(64) },
    evidenceRef: `evidence/S2-mcp-identity-${'9'.repeat(64)}.json`,
    previousOperationSha256: 'a'.repeat(64),
    ...overrides,
  };
  return {
    ...state,
    operationSha256: createHash('sha256').update(JSON.stringify(state)).digest('hex'),
  };
}

function live(overrides = {}) {
  return {
    operationSha256: durable().operationSha256,
    childId: 'S3-exact-authority',
    disposition: 'open',
    pullRequestState: 'OPEN',
    terminalFailure: false,
    origin: 'https://github.com/interdomestik/interdomestik',
    pullRequestNumber: 1619,
    base: '0'.repeat(40),
    head: '4'.repeat(40),
    testedMerge: '5'.repeat(40),
    protectedMain: '0'.repeat(40),
    writerMapSha256: writerMapDigest(paths),
    worktree: {
      root: '/private/tmp/s3',
      commonDir: '/repo/.git',
      head: '4'.repeat(40),
    },
    mcp: {
      sourceRoot: '/runtime/interdomestik-qa',
      sourceHead: '7'.repeat(40),
      sourceCommonDir: '/repo/.git',
      targetRoot: '/private/tmp/s3',
      targetHead: '4'.repeat(40),
      targetCommonDir: '/repo/.git',
      repoRoot: '/private/tmp/s3',
    },
    ...overrides,
  };
}

test('accepts the exact S3 projection and live lease', () => {
  const result = resolveCurrentAuthority({
    projection: projection(),
    durable: durable(),
    live: live(),
  });
  assert.equal(result.runtimeAuthorized, true);
  assert.equal(result.activeSlice, 'S3-exact-authority');
  assert.equal(result.successorsBlocked, false);
});

test('live merge consumes authority before ledger persistence', () => {
  const result = resolveCurrentAuthority({
    projection: projection(),
    durable: durable(),
    live: live({ pullRequestState: 'MERGED' }),
  });
  assert.deepEqual(result, {
    runtimeAuthorized: false,
    activeSlice: null,
    successorsBlocked: false,
    reason: 'authority_consumed_by_merge',
  });
});

test('terminal failure consumes and blocks successors', () => {
  const result = resolveCurrentAuthority({
    projection: projection(),
    durable: durable(),
    live: live({ terminalFailure: true }),
  });
  assert.equal(result.runtimeAuthorized, false);
  assert.equal(result.activeSlice, null);
  assert.equal(result.successorsBlocked, true);
  assert.equal(result.reason, 'terminal_failure');
});

test('missing or stale live identity fails closed', () => {
  for (const candidate of [null, live({ operationSha256: '9'.repeat(64) })]) {
    const result = resolveCurrentAuthority({
      projection: projection(),
      durable: durable(),
      live: candidate,
    });
    assert.equal(result.runtimeAuthorized, false);
    assert.equal(result.activeSlice, null);
    assert.equal(result.successorsBlocked, true);
  }
});

test('corrupt or contradictory durable state fails closed', () => {
  const invalid = [
    durable({ status: 'failed', runtimeAuthorized: true, successorsBlocked: true }),
    durable({ status: 'unknown', runtimeAuthorized: false, successorsBlocked: false }),
    durable({ status: 'closed', runtimeAuthorized: false, successorsBlocked: false }),
    durable({ unexpected: true }),
    { ...durable(), operationSha256: 'f'.repeat(64) },
  ];
  for (const candidate of invalid) {
    const result = resolveCurrentAuthority({
      projection: projection(),
      durable: candidate,
      live: live(),
    });
    assert.equal(result.reason, 'invalid_authority_projection');
    assert.equal(result.runtimeAuthorized, false);
    assert.equal(result.successorsBlocked, true);
  }
});

test('canonical origin spellings pass and foreign origins fail closed', () => {
  for (const origin of [
    'https://github.com/interdomestik/interdomestik/',
    'https://github.com/interdomestik/interdomestik.git',
    'git@github.com:interdomestik/interdomestik.git',
    'ssh://git@github.com/interdomestik/interdomestik.git',
  ]) {
    assert.equal(
      resolveCurrentAuthority({
        projection: projection(),
        durable: durable(),
        live: live({ origin }),
      }).runtimeAuthorized,
      true
    );
  }
  assert.equal(
    resolveCurrentAuthority({
      projection: projection(),
      durable: durable(),
      live: live({ origin: 'https://github.com/foreign/interdomestik' }),
    }).runtimeAuthorized,
    false
  );
});

test('worktree, common-dir, and MCP source/target drift fails closed', () => {
  const candidates = [
    live({ worktree: { ...live().worktree, head: '9'.repeat(40) } }),
    live({ mcp: { ...live().mcp, repoRoot: '/private/tmp/other' } }),
    live({ mcp: { ...live().mcp, sourceRoot: '/private/tmp/s3' } }),
    live({ mcp: { ...live().mcp, sourceHead: 'invalid' } }),
  ];
  for (const candidate of candidates) {
    const result = resolveCurrentAuthority({
      projection: projection(),
      durable: durable(),
      live: candidate,
    });
    assert.equal(result.runtimeAuthorized, false);
    assert.equal(result.activeSlice, null);
    assert.equal(result.successorsBlocked, true);
  }
});

test('projection drift fails closed', () => {
  const changed = projection();
  changed.writerMapSha256 = 'f'.repeat(64);
  assert.throws(() => validateProjection(changed), /writer map/i);
  const result = resolveCurrentAuthority({ projection: changed, durable: durable(), live: live() });
  assert.equal(result.reason, 'invalid_authority_projection');
});

test('program and tracker must carry one identical marker', () => {
  const marker =
    'The next active governed implementation goal is exactly one canonical tracker program: `IDA-WF01-ONE-APPROVAL-DELIVERY` (Tier 3; `runtime_authorized:true`).';
  assert.equal(
    validateProjectionDocuments(projection(), `# Program\n${marker}\n`, `# Tracker\n${marker}\n`),
    true
  );
  assert.throws(
    () => validateProjectionDocuments(projection(), marker, marker.replace('true', 'false')),
    /marker/i
  );
});

test('CLI is green only for an active exact live lease', () => {
  const root = mkdtempSync(join(tmpdir(), 'current-authority-state-'));
  const inputs = { projection: projection(), durable: durable(), live: live() };
  const args = [];
  for (const [name, value] of Object.entries(inputs)) {
    const path = join(root, `${name}.json`);
    writeFileSync(path, JSON.stringify(value));
    args.push(`--${name}=${path}`);
  }
  const active = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
  assert.equal(active.status, 0, active.stderr);
  assert.equal(JSON.parse(active.stdout).runtimeAuthorized, true);
  inputs.live.pullRequestState = 'MERGED';
  writeFileSync(join(root, 'live.json'), JSON.stringify(inputs.live));
  const consumed = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
  assert.equal(consumed.status, 1);
  assert.equal(JSON.parse(consumed.stdout).reason, 'authority_consumed_by_merge');
});
