import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';

const script = new URL('./current-program-contract-audit.mjs', import.meta.url).pathname;

function write(root, repoPath, value) {
  const target = join(root, repoPath);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, value);
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'current-program-contract-'));
  const program = readFileSync(
    new URL('../docs/plans/current-program.md', import.meta.url),
    'utf8'
  );
  const tracker = readFileSync(
    new URL('../docs/plans/current-tracker.md', import.meta.url),
    'utf8'
  );
  const agents = readFileSync(new URL('../AGENTS.md', import.meta.url), 'utf8');
  const programHistory = readFileSync(
    new URL('../docs/plans/history/2026-09-22-current-program-ledger.md', import.meta.url),
    'utf8'
  );
  const trackerHistory = readFileSync(
    new URL('../docs/plans/history/2026-09-22-current-tracker-ledger.md', import.meta.url),
    'utf8'
  );
  const packageJson = {
    scripts: {
      'plan:audit':
        'node scripts/plan-audit.mjs && node scripts/current-program-contract-audit.mjs',
      'plan:audit:legacy': 'node scripts/current-authority-format-audit.mjs',
      'test:delivery-safety': 'node --test scripts/slice-rehearse-review-parity.test.mjs',
      'test:ci:contracts': 'node --test scripts/ci/*.test.mjs',
      'legacy:validate':
        'pnpm plan:audit:legacy && node --test scripts/ci/lean-current-authority-contracts.legacy.mjs && pnpm test:harness-v2',
    },
  };
  write(root, 'AGENTS.md', agents);
  write(root, 'docs/plans/current-program.md', program);
  write(root, 'docs/plans/current-tracker.md', tracker);
  write(root, 'docs/plans/history/2026-09-22-current-program-ledger.md', programHistory);
  write(root, 'docs/plans/history/2026-09-22-current-tracker-ledger.md', trackerHistory);
  write(root, 'package.json', `${JSON.stringify(packageJson, null, 2)}\n`);
  return root;
}

function run(root) {
  return spawnSync(process.execPath, [script, '--root', root], { encoding: 'utf8' });
}

test('accepts concise current authority and archived historical ledgers', () => {
  const result = run(fixture());
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /current program contract audit passed/u);
});

test('rejects a retired Lean block in active authority', () => {
  const root = fixture();
  const programPath = join(root, 'docs/plans/current-program.md');
  writeFileSync(
    programPath,
    `${readFileSync(programPath, 'utf8')}\n\`\`\`json lean-authority\n{}\n\`\`\`\n`
  );
  const result = run(root);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /embeds retired Lean authority/u);
});

test('rejects a hard-coded framework version in either active authority file', () => {
  const root = fixture();
  const programPath = join(root, 'docs/plans/current-program.md');
  writeFileSync(programPath, `${readFileSync(programPath, 'utf8')}\nReact 19.4 runtime\n`);
  const result = run(root);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /hard-coded framework version/u);
});

test('rejects a weakened boundary even when the other authority file remains correct', () => {
  const root = fixture();
  const agentsPath = join(root, 'AGENTS.md');
  writeFileSync(
    agentsPath,
    readFileSync(agentsPath, 'utf8').replace(
      'read-only unless the owner explicitly authorizes a justified change',
      'the routing implementation'
    )
  );
  const result = run(root);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /AGENTS\.md: missing read-only proxy authority/u);
});

test('rejects removal of owner-only governance document changes', () => {
  const root = fixture();
  const programPath = join(root, 'docs/plans/current-program.md');
  writeFileSync(
    programPath,
    readFileSync(programPath, 'utf8').replace(
      /- `README\.md`, `AGENTS\.md` and architecture documents[^]*?bounded owned files\.\n/u,
      ''
    )
  );
  const result = run(root);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /missing owner-only governance document changes/u);
});

test('rejects ordinary plan audit coupled to legacy authority reconstruction', () => {
  const root = fixture();
  const packagePath = join(root, 'package.json');
  const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'));
  packageJson.scripts['plan:audit'] += ' && node scripts/current-authority-format-audit.mjs';
  writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);
  const result = run(root);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /ordinary plan:audit invokes the legacy authority audit/u);
});

test('rejects an incomplete explicit legacy validation lane', () => {
  const root = fixture();
  const packagePath = join(root, 'package.json');
  const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'));
  packageJson.scripts['legacy:validate'] = 'pnpm test:harness-v2';
  writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);
  const result = run(root);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /explicit legacy validation is incomplete/u);
});

test('rejects ordinary CI contracts coupled to the legacy wrapper', () => {
  const root = fixture();
  const packagePath = join(root, 'package.json');
  const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'));
  packageJson.scripts['test:ci:contracts'] +=
    ' scripts/ci/lean-current-authority-contracts.legacy.mjs';
  writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);
  const result = run(root);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /ordinary CI contracts invoke the legacy authority wrapper/u);
});

test('rejects two concurrent in-progress objectives', () => {
  const root = fixture();
  const trackerPath = join(root, 'docs/plans/current-tracker.md');
  const tracker = readFileSync(trackerPath, 'utf8');
  const extra = '| `SECOND` | `in_progress` | Codex | second objective | second acceptance |';
  writeFileSync(
    trackerPath,
    tracker.replace('\n\n### Current acceptance', `\n${extra}\n\n### Current acceptance`)
  );
  const result = run(root);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /more than one item is in progress/u);
});
