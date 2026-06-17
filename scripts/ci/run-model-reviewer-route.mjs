#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { modelReviewRoutes } from './model-review-routes.mjs';
import { writeRouteReceipt } from './reviewer-route-receipts.mjs';
import { runReviewerRoute, skippedRouteReceipt } from './reviewer-route-runtime.mjs';

function argValue(args, name, fallback = '') {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

function option(args, name, fallback = '') {
  const prefix = `${name}=`;
  return args.find(arg => arg.startsWith(prefix))?.slice(prefix.length) || argValue(args, name, fallback);
}

function safeInputFile(file) {
  const resolved = path.resolve(file);
  const allowedRoots = [process.cwd(), os.tmpdir()].map(root => path.resolve(root));
  if (!allowedRoots.some(root => resolved === root || resolved.startsWith(`${root}${path.sep}`))) {
    throw new Error(`prompt file must be inside the repository or temp dir: ${file}`);
  }
  return resolved;
}

function promptFromArgs(args) {
  const file = option(args, '--prompt-file') || process.env.REVIEW_PROMPT_FILE || '';
  if (file) return fs.readFileSync(safeInputFile(file), 'utf8');
  if (process.env.REVIEW_PROMPT) return process.env.REVIEW_PROMPT;
  return [
    'Review this branch as an adversarial PR reviewer.',
    'Do not edit files. Findings first with file/line references.',
    'Use code_review.md and the current git diff as the review frame.',
  ].join('\n');
}

function printableReceipt(receipt, paths) {
  const { stdout, stderr, ...safeReceipt } = receipt;
  return { ...safeReceipt, receipt: paths };
}

function exitForReceipt(receipt) {
  if (receipt.status === 'ran' || receipt.status === 'skipped') return 0;
  if (receipt.status === 'blocked') return receipt.exitCode === 127 ? 127 : 125;
  return receipt.exitCode || 1;
}

async function main() {
  const args = process.argv.slice(2);
  const routeName = option(args, '--route');
  const route = modelReviewRoutes[routeName];
  if (!route) {
    console.error(`unknown reviewer route: ${routeName || '(missing)'}`);
    process.exit(2);
  }

  const requireEscalation =
    routeName === 'opus' && !args.includes('--allow-escalation') && process.env.REVIEW_ESCALATION_REQUIRED !== '1';
  const commandInvoked = [route.command, ...route.args('<prompt>')];
  const timeoutMs = Number(option(args, '--timeout-ms', String(route.timeoutMs)));
  const noOutputTimeoutMs = Number(
    option(args, '--no-output-timeout-ms', String(route.noOutputTimeoutMs))
  );
  const receiptDir = option(args, '--receipt-dir', process.env.REVIEW_RECEIPT_DIR || '');

  if (requireEscalation) {
    const receipt = skippedRouteReceipt({
      routeName,
      provider: route.provider,
      model: route.model,
      commandInvoked,
      timeoutMs,
      noOutputTimeoutMs,
      blockerReason: 'opus_escalation_not_required',
    });
    const paths = writeRouteReceipt(receipt, receiptDir || undefined);
    console.log(JSON.stringify(printableReceipt(receipt, paths), null, 2));
    process.exit(0);
  }

  const prompt = promptFromArgs(args);
  const receipt = await runReviewerRoute({
    routeName,
    provider: route.provider,
    model: route.model,
    command: route.command,
    args: route.args(prompt),
    timeoutMs,
    noOutputTimeoutMs,
  });
  const paths = writeRouteReceipt(receipt, receiptDir || undefined);
  console.log(JSON.stringify(printableReceipt(receipt, paths), null, 2));
  process.exit(exitForReceipt(receipt));
}

await main();
