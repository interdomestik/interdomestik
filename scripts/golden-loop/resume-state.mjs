#!/usr/bin/env node
// Golden Loop resume-state persistence: atomic JSON state per slice plus an
// append-only journal, so later runs never rediscover prior work.
// Usage:
//   node scripts/golden-loop/resume-state.mjs init --root tmp/golden-loop --slice <id> [--branch b --base-sha s]
//   node scripts/golden-loop/resume-state.mjs get  --root tmp/golden-loop --slice <id> [--field phase]
//   node scripts/golden-loop/resume-state.mjs set  --root tmp/golden-loop --slice <id> --field phase --value P3
//   node scripts/golden-loop/resume-state.mjs log  --root tmp/golden-loop --slice <id> --message "gate static passed"
import fs from 'node:fs';
import process from 'node:process';
import { safeJoin, safeName, safeRoot } from './safe-paths.mjs';

function argValue(args, name, fallback = '') {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

export function statePaths(root, sliceId) {
  const dir = safeJoin(root, safeName(sliceId, 'slice'));
  return { dir, state: safeJoin(dir, 'state.json'), journal: safeJoin(dir, 'journal.log') };
}

export function emptyState(sliceId) {
  return {
    stateVersion: 1,
    sliceId,
    phase: 'P0',
    branch: null,
    baseSha: null,
    designNote: null,
    gates: [],
    reviews: [],
    pr: null,
    budgets: { modelCalls: 0, gitRemoteCalls: 0, fullGateRuns: 0 },
    blockers: [],
    updatedAt: null,
  };
}

export function readState(root, sliceId) {
  const { state } = statePaths(root, sliceId);

  // codeql[js/path-injection] state is constrained by safeRoot/safeName/safeJoin.
  if (!fs.existsSync(state)) return null;

  // codeql[js/path-injection] state is constrained by safeRoot/safeName/safeJoin.
  return JSON.parse(fs.readFileSync(state, 'utf8'));
}

export function writeState(root, sliceId, state) {
  const { dir, state: statePath } = statePaths(root, sliceId);

  // codeql[js/path-injection] state dir is constrained by safeRoot/safeName/safeJoin.
  fs.mkdirSync(dir, { recursive: true });
  state.updatedAt = new Date().toISOString();
  const temp = `${statePath}.tmp-${process.pid}`;

  // codeql[js/path-injection] temp state path is constrained by safeRoot/safeName/safeJoin.
  fs.writeFileSync(temp, `${JSON.stringify(state, null, 2)}\n`);

  // codeql[js/path-injection] state paths are constrained by safeRoot/safeName/safeJoin.
  fs.renameSync(temp, statePath);
  return state;
}

export function appendJournal(root, sliceId, message) {
  const { dir, journal } = statePaths(root, sliceId);

  // codeql[js/path-injection] journal dir is constrained by safeRoot/safeName/safeJoin.
  fs.mkdirSync(dir, { recursive: true });

  // codeql[js/path-injection] journal path is constrained by safeRoot/safeName/safeJoin.
  fs.appendFileSync(journal, `${new Date().toISOString()} ${message}\n`);
}

function parseValue(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  const root = safeRoot(argValue(args, '--root', process.env.GOLDEN_LOOP_EVIDENCE_ROOT));
  const sliceId = safeName(argValue(args, '--slice'), 'slice');
  if (!command || !sliceId) {
    console.error('resume-state: usage: <init|get|set|log> --slice <id> [--root <dir>]');
    process.exit(1);
  }
  if (command === 'init') {
    if (readState(root, sliceId)) {
      console.error(`resume-state: state already exists for ${sliceId}; refusing to overwrite`);
      process.exit(1);
    }
    const state = emptyState(sliceId);
    state.branch = argValue(args, '--branch') || null;
    state.baseSha = argValue(args, '--base-sha') || null;
    writeState(root, sliceId, state);
    appendJournal(root, sliceId, `init phase=P0 branch=${state.branch ?? '-'}`);
    console.log(JSON.stringify(state, null, 2));
    return;
  }
  const state = readState(root, sliceId);
  if (!state) {
    console.error(`resume-state: no state for slice ${sliceId} under ${root}`);
    process.exit(1);
  }
  if (command === 'get') {
    const field = argValue(args, '--field');
    console.log(JSON.stringify(field ? state[field] : state, null, 2));
  } else if (command === 'set') {
    const field = argValue(args, '--field');
    if (!field) {
      console.error('resume-state: set requires --field');
      process.exit(1);
    }
    state[field] = parseValue(argValue(args, '--value'));
    writeState(root, sliceId, state);
    appendJournal(root, sliceId, `set ${field}`);
    console.log('ok');
  } else if (command === 'log') {
    appendJournal(root, sliceId, argValue(args, '--message', '(no message)'));
    console.log('ok');
  } else {
    console.error(`resume-state: unknown command ${command}`);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) main();
