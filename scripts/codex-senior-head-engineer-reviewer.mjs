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

function printableReceipt(receipt, paths) {
  return {
    routeName: receipt.routeName,
    status: receipt.status,
    blockerReason: receipt.blockerReason,
    exitCode: receipt.exitCode,
    receipt: paths,
  };
}

const receipt = await runReviewerRoute({
  routeName: 'codex-senior-reviewer',
  provider: 'openai',
  model: 'codex-cli',
  command: process.execPath,
  args: [packet, `--repo=${process.cwd()}`],
  timeoutMs: 15 * 60_000,
  noOutputTimeoutMs: 300_000,
});
const paths = writeRouteReceipt(receipt);
console.log(JSON.stringify(printableReceipt(receipt, paths), null, 2));
process.exit(exitForReceipt(receipt));
