#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { redact, safeId, writeJson } from './z620-runner-lib.mjs';
import { validateGateCoverage, validateWorkflowDigests } from './z620-parity-lib.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = Object.fromEntries(
  process.argv.slice(2).map(argument => {
    const [key, ...value] = argument.replace(/^--/, '').split('=');
    return [key, value.join('=') || true];
  })
);
const gates = JSON.parse(fs.readFileSync(path.join(root, 'scripts/ci/z620-gates.json')));
const parity = JSON.parse(fs.readFileSync(path.join(root, 'scripts/ci/z620-parity.json')));
const requested = String(args.lanes || 'validation,audit,static,unit,database,build,security')
  .split(',')
  .map(lane => safeId(lane, 'lane'));
const evidenceDir = path.resolve(String(args['evidence-dir'] || path.join(root, 'tmp/z620-gates')));
const problems = [...validateWorkflowDigests(root, parity), ...validateGateCoverage(parity, gates)];
if (problems.length) throw new Error(problems.join('\n'));
fs.mkdirSync(path.join(evidenceDir, 'logs'), { recursive: true, mode: 0o700 });
const results = [];

for (const lane of requested) {
  const definition = gates.lanes[lane];
  if (!definition) throw new Error(`Unknown lane ${lane}`);
  if (definition.conditional && args['include-conditional'] !== 'true') {
    results.push({ lane, status: 'not_selected', commands: [] });
    continue;
  }
  if (definition.resourceOwned && (!process.env.E2E_DATABASE_URL || !process.env.PW_PORT)) {
    throw new Error(`${lane} requires task-owned database and PW_PORT`);
  }
  const laneResult = { lane, status: 'pass', commands: [] };
  for (const [command, ...commandArgs] of definition.commands) {
    const started = Date.now();
    const result = spawnSync(command, commandArgs, {
      cwd: root,
      env: { ...process.env, CI: 'true' },
      encoding: 'utf8',
      maxBuffer: 100 * 1024 * 1024,
    });
    const logName = `${lane}-${laneResult.commands.length + 1}.log`;
    fs.writeFileSync(
      path.join(evidenceDir, 'logs', logName),
      redact(`${result.stdout || ''}${result.stderr || ''}`)
    );
    const status = result.status === 0 ? 'pass' : 'fail';
    laneResult.commands.push({
      command: [command, ...commandArgs],
      status,
      exitCode: result.status ?? 1,
      durationMs: Date.now() - started,
      log: `logs/${logName}`,
    });
    if (status === 'fail') {
      laneResult.status = 'fail';
      break;
    }
  }
  results.push(laneResult);
}

const evidence = {
  status: results.every(result => ['pass', 'not_selected'].includes(result.status))
    ? 'pass'
    : 'fail',
  sha: process.env.CI_LOCAL_HEAD_SHA || '',
  results,
};
writeJson(path.join(evidenceDir, 'gate-results.json'), evidence);
console.log(JSON.stringify({ status: evidence.status, evidenceDir }));
if (evidence.status !== 'pass') process.exitCode = 1;
