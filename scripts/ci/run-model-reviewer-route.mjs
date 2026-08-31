#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import process from 'node:process';
import { canonicalJson, sha256 } from '../slice-rehearse-canonical.mjs';
import { modelReviewRoutes } from './model-review-routes.mjs';
import { writeRouteReceipt } from './reviewer-route-receipts.mjs';
import { runReviewerRoute, skippedRouteReceipt } from './reviewer-route-runtime.mjs';

function argValue(args, name, fallback = '') {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

function option(args, name, fallback = '') {
  const prefix = `${name}=`;
  return (
    args.find(arg => arg.startsWith(prefix))?.slice(prefix.length) || argValue(args, name, fallback)
  );
}

const MAX_DIFF_BYTES = 512 * 1024;
const SAFE_GIT = Object.freeze({
  encoding: 'utf8',
  env: { PATH: '/usr/bin:/bin:/usr/sbin:/sbin' },
  maxBuffer: MAX_DIFF_BYTES + 64 * 1024,
  timeout: 30_000,
});

function candidatePacket() {
  const baseSha = execFileSync(
    '/usr/bin/git',
    ['rev-parse', 'refs/remotes/origin/main^{commit}'],
    SAFE_GIT
  ).trim();
  const headSha = execFileSync('/usr/bin/git', ['rev-parse', 'HEAD^{commit}'], SAFE_GIT).trim();
  const treeSha = execFileSync('/usr/bin/git', ['rev-parse', 'HEAD^{tree}'], SAFE_GIT).trim();
  const diff = execFileSync(
    '/usr/bin/git',
    ['diff', '--no-ext-diff', '--unified=3', `${baseSha}...${headSha}`],
    SAFE_GIT
  );
  if (Buffer.byteLength(diff) > MAX_DIFF_BYTES) {
    throw new Error('review candidate diff exceeds the bounded packet limit');
  }
  return {
    identity: { baseSha, headSha, treeSha, diffSha256: sha256(diff) },
    text: [
      'Exact candidate identity:',
      canonicalJson({ baseSha, headSha, treeSha, diffSha256: sha256(diff) }).trimEnd(),
      'Candidate diff:',
      '```diff',
      diff,
      '```',
    ].join('\n'),
  };
}

function promptFromEnv(packet) {
  const instruction =
    process.env.REVIEW_PROMPT ||
    [
      'Review this branch as an adversarial PR reviewer.',
      'Do not edit files. Findings first with file/line references.',
      'Use code_review.md and the bounded candidate packet below as the review frame.',
      'End with exactly VERDICT: PASS when there are no findings, or VERDICT: FINDINGS when findings remain.',
    ].join('\n');
  return `${instruction}\n\n${packet.text}`;
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
    routeName === 'opus' &&
    !args.includes('--allow-escalation') &&
    process.env.REVIEW_ESCALATION_REQUIRED !== '1';
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

  const packet = candidatePacket();
  const prompt = promptFromEnv(packet);
  const receipt = await runReviewerRoute({
    routeName,
    provider: route.provider,
    model: route.model,
    command: route.command,
    args: route.args(prompt),
    commandInvoked,
    candidateIdentity: packet.identity,
  });
  const paths = writeRouteReceipt(receipt);
  console.log(JSON.stringify(printableReceipt(receipt, paths), null, 2));
  process.exit(exitForReceipt(receipt));
}

await main();
