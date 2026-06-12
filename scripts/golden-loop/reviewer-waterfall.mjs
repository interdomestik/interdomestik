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
//   node scripts/golden-loop/reviewer-waterfall.mjs --adapter <path> --slice <id> --prompt-file <path>
import process from 'node:process';
import { executeReviewerRoute } from './reviewer-exec.mjs';
import { createReceiptWriter, createReviewPacketWriter } from './reviewer-receipt.mjs';
import { buildContractPreamble, classifyReview } from './review-contract.mjs';
import { safeName, safeReadJson, safeReadText, safeRoot } from './safe-paths.mjs';

function argValue(args, name, fallback = '') {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

export async function runWaterfall(order, routes, prompt, executor, options = {}) {
  const results = [];
  let winner = null;
  for (const reviewer of order) {
    const route = routes[reviewer];
    const startedAt = new Date().toISOString();
    const startedMs = Date.now();
    const timed = result => ({
      ...result,
      startedAt,
      completedAt: new Date().toISOString(),
      durationMs: Date.now() - startedMs,
      timeoutMs: options.timeoutMs || null,
    });
    if (!route) {
      results.push(timed({ reviewer, status: 'unavailable', reason: 'no route defined' }));
      continue;
    }
    const execResult = await executor(route, prompt);
    if (options.dryRun) {
      const result = timed({
        reviewer,
        status: execResult.unavailable ? 'unavailable' : 'route-available',
        reason: execResult.reason || 'availability probe only — not review evidence',
      });
      results.push(result);
      options.onResult?.({ results, winner });
      continue; // dry-run probes every route and can never produce a winner
    }
    const classified = classifyReview(execResult, { sliceId: options.sliceId });
    const reviewPacket = execResult.output
      ? options.onReview?.({ reviewer, classified, execResult })
      : null;
    const result = timed({
      reviewer,
      status: classified.status,
      reason: classified.reason,
      ...(reviewPacket ? { reviewPacket } : {}),
    });
    results.push(result);
    if (classified.status === 'completed') {
      winner = { reviewer, output: execResult.output };
      options.onResult?.({ results, winner });
      break; // remaining routes intentionally skipped (call budget)
    }
    options.onResult?.({ results, winner });
  }
  return { results, winner };
}

async function main() {
  const args = process.argv.slice(2);
  const adapterPath = argValue(args, '--adapter', process.env.GOLDEN_LOOP_ADAPTER || '');
  const sliceId = safeName(argValue(args, '--slice'), 'slice');
  const promptFile = argValue(args, '--prompt-file');
  const root = safeRoot(argValue(args, '--root', process.env.GOLDEN_LOOP_EVIDENCE_ROOT));
  const timeoutSeconds = Number(argValue(args, '--route-timeout-seconds', '0'));
  const dryRun = args.includes('--dry-run');
  if (!adapterPath || !sliceId || !promptFile) {
    console.error(
      'reviewer-waterfall: usage: --adapter <path> --slice <id> --prompt-file <path> [--dry-run]'
    );
    process.exit(1);
  }
  const adapter = safeReadJson(adapterPath);
  const prompt = buildContractPreamble(sliceId) + safeReadText(promptFile);
  const { order, routes } = adapter.reviewerWaterfall;
  const timeoutMs =
    timeoutSeconds > 0
      ? timeoutSeconds * 1000
      : (adapter.budgets?.maxReviewerRouteMinutes || 15) * 60 * 1000;
  const startedAt = new Date().toISOString();
  const { writeReceipt } = createReceiptWriter({
    root,
    sliceId,
    dryRun,
    timeoutMs,
    startedAt,
  });
  const writeReviewPacket = createReviewPacketWriter({
    root,
    sliceId,
    byteBudget: adapter.evidenceByteBudget || 16384,
  });
  const { results, winner } = await runWaterfall(
    order,
    routes,
    prompt,
    (route, p) => executeReviewerRoute(route, p, { dryRun, timeoutMs }),
    {
      dryRun,
      sliceId,
      timeoutMs,
      onReview: dryRun ? null : writeReviewPacket,
      onResult: state => writeReceipt(state.results, state.winner, true),
    }
  );
  const receipt = writeReceipt(results, winner, false);
  console.log(JSON.stringify(receipt, null, 2));
  if (dryRun) process.exit(results.some(result => result.status === 'route-available') ? 0 : 2);
  process.exit(winner ? 0 : 2);
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  try {
    await main();
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}
