#!/usr/bin/env node
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { writeRouteReceipt } from './ci/reviewer-route-receipts.mjs';
import { runReviewerRoute } from './ci/reviewer-route-runtime.mjs';

const skillRoot =
  process.env.CODEX_INTERDOMESTIK_SLICE_RUNNER_ROOT ||
  path.join(os.homedir(), '.codex/skills/interdomestik-slice-runner');
const packet = path.join(skillRoot, 'scripts/codex-review-packet.mjs');

function exitForReceipt(receipt) {
  if (receipt.status === 'ran') return 0;
  if (receipt.status === 'blocked') return receipt.exitCode === 127 ? 127 : 125;
  return receipt.exitCode || 1;
}

const receipt = await runReviewerRoute({
  routeName: 'codex-senior-reviewer',
  provider: 'openai',
  model: 'codex-cli',
  command: process.execPath,
  args: [packet, `--repo=${process.cwd()}`],
});
writeRouteReceipt(receipt);
process.stdout.write('codex senior reviewer receipt written\n');
process.exit(exitForReceipt(receipt));
