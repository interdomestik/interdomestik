#!/usr/bin/env node
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

function promptFromEnv() {
  if (process.env.REVIEW_PROMPT) return process.env.REVIEW_PROMPT;
  return [
    'Review this branch as an adversarial PR reviewer.',
    'Do not edit files. Findings first with file/line references.',
    'Use code_review.md and the current git diff as the review frame.',
  ].join('\n');
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

  if (requireEscalation) {
    const receipt = skippedRouteReceipt({
      routeName,
      provider: route.provider,
      model: route.model,
      commandInvoked,
      timeoutMs: route.timeoutMs,
      noOutputTimeoutMs: route.noOutputTimeoutMs,
      blockerReason: 'opus_escalation_not_required',
    });
    const paths = writeRouteReceipt(receipt);
    console.log(JSON.stringify(printableReceipt(receipt, paths), null, 2));
    process.exit(0);
  }

  const prompt = promptFromEnv();
  const receipt = await runReviewerRoute({
    routeName,
    provider: route.provider,
    model: route.model,
    command: route.command,
    args: route.args(prompt),
  });
  const paths = writeRouteReceipt(receipt);
  console.log(JSON.stringify(printableReceipt(receipt, paths), null, 2));
  process.exit(exitForReceipt(receipt));
}

await main();
