#!/usr/bin/env node
// Golden Loop sequential reviewer waterfall: consult routes in adapter order,
// stop at the first review satisfying the senior-review contract
// (review-contract.mjs) with verdict READY and no unresolved BLOCKER findings.
// Later routes run only on fallback triggers (unavailable/error/refused/
// invalid/unresolved-blockers). Refusal/reroute is a normal fallback, never a
// slice blocker.
// Dry-run (--dry-run) probes route availability ONLY: it never produces a
// winner, a valid receipt, or review evidence of any kind.
// Usage:
//   node scripts/golden-loop/reviewer-waterfall.mjs --adapter <path> --slice <id> \
//     --prompt-file <path> [--root tmp/golden-loop] [--dry-run]
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { buildPacket, writePacket } from './evidence-packet.mjs';
import { buildContractPreamble, classifyReview } from './review-contract.mjs';

function argValue(args, name, fallback = '') {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

function defaultExecutor(route, prompt, dryRun) {
  const probe = spawnSync('/bin/sh', ['-lc', `command -v ${route.command}`], { encoding: 'utf8' });
  if (probe.status !== 0) {
    return { unavailable: true, reason: `${route.command} not on PATH`, exitCode: -1, output: '' };
  }
  if (dryRun) return { probeOnly: true, unavailable: false };
  const args = route.args.map(arg => (arg === '{prompt}' ? prompt : arg));
  const result = spawnSync(route.command, args, {
    encoding: 'utf8',
    timeout: 15 * 60 * 1000,
    maxBuffer: 16 * 1024 * 1024,
  });
  return {
    unavailable: false,
    exitCode: result.status ?? -1,
    output: `${result.stdout || ''}${result.stderr || ''}`,
  };
}

export function runWaterfall(order, routes, prompt, executor, options = {}) {
  const results = [];
  let winner = null;
  for (const reviewer of order) {
    const route = routes[reviewer];
    if (!route) {
      results.push({ reviewer, status: 'unavailable', reason: 'no route defined' });
      continue;
    }
    const execResult = executor(route, prompt);
    if (options.dryRun) {
      results.push({
        reviewer,
        status: execResult.unavailable ? 'unavailable' : 'route-available',
        reason: execResult.reason || 'availability probe only — not review evidence',
      });
      continue; // dry-run probes every route and can never produce a winner
    }
    const classified = classifyReview(execResult, { sliceId: options.sliceId });
    results.push({ reviewer, status: classified.status, reason: classified.reason });
    if (classified.status === 'completed') {
      winner = { reviewer, output: execResult.output };
      break; // remaining routes intentionally skipped (call budget)
    }
  }
  return { results, winner };
}

function main() {
  const args = process.argv.slice(2);
  const adapterPath = argValue(args, '--adapter', process.env.GOLDEN_LOOP_ADAPTER || '');
  const sliceId = argValue(args, '--slice');
  const promptFile = argValue(args, '--prompt-file');
  const root = argValue(args, '--root', process.env.GOLDEN_LOOP_EVIDENCE_ROOT || 'tmp/golden-loop');
  const dryRun = args.includes('--dry-run');
  if (!adapterPath || !sliceId || !promptFile) {
    console.error(
      'reviewer-waterfall: usage: --adapter <path> --slice <id> --prompt-file <path> [--dry-run]'
    );
    process.exit(1);
  }
  const adapter = JSON.parse(fs.readFileSync(adapterPath, 'utf8'));
  const prompt = buildContractPreamble(sliceId) + fs.readFileSync(promptFile, 'utf8');
  const { order, routes } = adapter.reviewerWaterfall;
  const { results, winner } = runWaterfall(
    order,
    routes,
    prompt,
    (route, p) => defaultExecutor(route, p, dryRun),
    { dryRun, sliceId }
  );
  const receiptDir = path.join(root, sliceId, 'reviews');
  fs.mkdirSync(receiptDir, { recursive: true });
  const receipt = {
    receiptVersion: 2,
    sliceId,
    mode: dryRun ? 'dry-run' : 'live',
    isReviewEvidence: !dryRun && Boolean(winner),
    capturedAt: new Date().toISOString(),
    results,
    winner: winner ? winner.reviewer : null,
  };
  const receiptName = dryRun ? 'availability-probe.json' : 'waterfall.json';
  fs.writeFileSync(path.join(receiptDir, receiptName), `${JSON.stringify(receipt, null, 2)}\n`);
  if (winner) {
    const packet = buildPacket({
      name: `review-${winner.reviewer}`,
      source: `reviewer-waterfall:${winner.reviewer}`,
      output: winner.output,
      exitCode: 0,
      byteBudget: adapter.evidenceByteBudget || 16384,
    });
    writePacket(root, sliceId, packet);
  }
  console.log(JSON.stringify(receipt, null, 2));
  if (dryRun) process.exit(results.some(result => result.status === 'route-available') ? 0 : 2);
  process.exit(winner ? 0 : 2);
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) main();
