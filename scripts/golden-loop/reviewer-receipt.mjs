import { buildPacket, writePacket } from './evidence-packet.mjs';
import { safeName } from './safe-paths.mjs';

export function createReceiptWriter({ root, sliceId, dryRun, timeoutMs, startedAt }) {
  const safeSliceId = safeName(sliceId, 'slice');
  const receiptName = dryRun ? 'availability-probe' : 'waterfall';
  const writeReceipt = (results, winner, partial = false) => {
    const receipt = {
      receiptVersion: 2,
      sliceId: safeSliceId,
      mode: dryRun ? 'dry-run' : 'live',
      isReviewEvidence: !dryRun && Boolean(winner),
      partial,
      startedAt,
      completedAt: new Date().toISOString(),
      routeTimeoutMs: timeoutMs,
      results,
      winner: winner ? winner.reviewer : null,
    };
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
    return { ...receipt, receiptPacket };
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
