import fs from 'node:fs';
import path from 'node:path';
import { buildPacket, writePacket } from './evidence-packet.mjs';
import { safeName } from './safe-paths.mjs';

function markdown(receipt) {
  const lines = [
    `# Reviewer Waterfall Receipt: ${receipt.sliceId}`,
    '',
    `- status: ${receipt.isReviewEvidence ? 'ran' : receipt.partial ? 'blocked' : 'failed'}`,
    `- mode: ${receipt.mode}`,
    `- startedAt: ${receipt.startedAt}`,
    `- endedAt: ${receipt.endedAt}`,
    `- elapsedMs: ${receipt.elapsedMs}`,
    `- fallbackWinner: ${receipt.fallbackWinner || 'none'}`,
    '',
    '| route | model/provider | status | blockerReason | exitCode | firstOutputTimeout | totalTimeout |',
    '| --- | --- | --- | --- | --- | --- | --- |',
  ];
  for (const result of receipt.results) {
    lines.push(
      `| ${result.routeName || result.reviewer} | ${result.model || 'unknown'}/${result.provider || 'unknown'} | ${result.status} | ${result.blockerReason || 'none'} | ${result.exitCode ?? 'null'} | ${Boolean(result.firstOutputTimeout?.timedOut)} | ${Boolean(result.totalTimeout?.timedOut)} |`
    );
  }
  return `${lines.join('\n')}\n`;
}

export function createReceiptWriter({ root, sliceId, dryRun, timeoutMs, startedAt }) {
  const safeSliceId = safeName(sliceId, 'slice');
  const receiptName = dryRun ? 'availability-probe' : 'waterfall';
  const startedMs = Date.now();
  const writeReceipt = (results, winner, partial = false) => {
    const endedAt = new Date().toISOString();
    const receipt = {
      receiptVersion: 3,
      sliceId: safeSliceId,
      mode: dryRun ? 'dry-run' : 'live',
      isReviewEvidence: !dryRun && Boolean(winner),
      partial,
      startedAt,
      endedAt,
      completedAt: endedAt,
      elapsedMs: Date.now() - startedMs,
      routeTimeoutMs: timeoutMs,
      results,
      winner: winner ? winner.reviewer : null,
      fallbackWinner: winner ? winner.reviewer : null,
    };
    const reviewDir = path.join(root, safeSliceId, 'reviews');
    fs.mkdirSync(reviewDir, { recursive: true });
    const receiptJson = path.join(reviewDir, `${receiptName}.json`);
    const receiptMarkdown = path.join(reviewDir, `${receiptName}.md`);
    fs.writeFileSync(receiptJson, `${JSON.stringify(receipt, null, 2)}\n`);
    fs.writeFileSync(receiptMarkdown, markdown(receipt));
    const receiptPacket = writePacket(
      root,
      safeSliceId,
      buildPacket({
        name: receiptName,
        source: 'reviewer-waterfall receipt',
        output: JSON.stringify(receipt, null, 2),
        exitCode: partial ? -1 : 0,
        byteBudget: 16384,
      })
    );
    return { ...receipt, receiptJson, receiptMarkdown, receiptPacket };
  };
  return { writeReceipt };
}

export function createReviewPacketWriter({ root, sliceId, byteBudget }) {
  const safeSliceId = safeName(sliceId, 'slice');
  return ({ reviewer, classified, execResult }) =>
    writePacket(
      root,
      safeSliceId,
      buildPacket({
        name: `review-${reviewer}`,
        source: `reviewer-waterfall:${reviewer}:${classified.status}`,
        output: execResult.output,
        exitCode: execResult.exitCode ?? -1,
        byteBudget,
      })
    );
}
