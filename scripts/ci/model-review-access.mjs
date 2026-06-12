import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import process from 'node:process';
import {
  assertKnownReviewers,
  modelReviewRoutes,
  parseReviewerList,
} from './model-review-routes.mjs';

const PROMPT =
  'Interdomestik model-review access check. Reply OK only. No repository data included.';

function argValue(args, name, fallback = '') {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

function timestamp() {
  return new Date().toISOString().replace(/[-:.]/g, '').slice(0, 15);
}

function commandAvailable(command) {
  return spawnSync('/bin/sh', ['-c', `command -v ${command}`], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function runProbe(route, probe) {
  const available = commandAvailable(route.command);
  if (available.status !== 0) {
    return { status: 'blocked', reason: `${route.command} command unavailable` };
  }
  if (probe === 'command') {
    return { status: 'available', reason: 'command available; auth/quota not probed' };
  }
  const result = spawnSync(route.command, route.args(PROMPT), {
    encoding: 'utf8',
    timeout: 45000,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.status === 0)
    return { status: 'completed', reason: 'minimal access prompt completed' };
  const output = `${result.stderr || ''}${result.stdout || ''}`.trim().slice(0, 240);
  return { status: 'blocked', reason: output || `exit ${result.status ?? 'unknown'}` };
}

function main() {
  const args = process.argv.slice(2);
  const required = parseReviewerList(argValue(args, '--required'), ['sonnet']);
  const reviewers = [...new Set([...parseReviewerList(argValue(args, '--reviewers')), ...required])];
  const probe = argValue(args, '--probe', 'call');
  if (!['call', 'command'].includes(probe)) throw new Error('--probe must be call or command');
  assertKnownReviewers(reviewers);

  const runRoot =
    argValue(args, '--run-root') || path.join('tmp', 'model-review-access', timestamp());
  const reviewDir = path.join(runRoot, 'reviews');
  fs.mkdirSync(reviewDir, { recursive: true });

  const results = reviewers.map(reviewer => {
    const route = modelReviewRoutes[reviewer];
    return {
      reviewer,
      required: required.includes(reviewer),
      label: route.label,
      ...runProbe(route, probe),
    };
  });
  const acceptableRequired = probe === 'command' ? ['available', 'completed'] : ['completed'];
  const blockedRequired = results.filter(
    result => result.required && !acceptableRequired.includes(result.status)
  );
  let status = 'pass';
  if (blockedRequired.length > 0) {
    status = 'blocked';
  } else if (probe === 'command') {
    status = 'available';
  }
  const receipt = {
    status,
    probe,
    generatedAt: new Date().toISOString(),
    reviewers,
    required,
    results,
  };
  const out = path.join(reviewDir, 'model-review-access.json');
  fs.writeFileSync(out, `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(`[model-review-access] receipt=${out}`);
  if (blockedRequired.length > 0) process.exitCode = 1;
}

main();
