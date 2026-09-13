import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

function receiptMarkdown(receipt) {
  return [
    `# Reviewer Route Receipt: ${receipt.routeName}`,
    '',
    `- status: ${receipt.status}`,
    `- configured model/provider: ${receipt.configuredModel ?? receipt.model}/${receipt.provider}`,
    `- provider-reported model: ${receipt.providerReportedModel ?? 'null'}`,
    `- native-selected model: ${receipt.nativeSelectedModel ?? 'null'}`,
    `- model evidence basis: ${receipt.evidenceBasis ?? 'unavailable'}`,
    `- evidence limitation: ${receipt.nativeExecutionInference?.limitation ?? receipt.restrictedExecution?.limitation ?? 'none recorded'}`,
    `- aggregate model usage: ${JSON.stringify(receipt.aggregateModelUsage ?? null)}`,
    `- review verdict: ${receipt.reviewVerdict ?? 'null'}`,
    `- candidate: ${receipt.candidateIdentity ? JSON.stringify(receipt.candidateIdentity) : 'null'}`,
    `- command: ${receipt.commandInvoked.join(' ')}`,
    `- startedAt: ${receipt.startedAt}`,
    `- endedAt: ${receipt.endedAt}`,
    `- elapsedMs: ${receipt.elapsedMs}`,
    `- blockerReason: ${receipt.blockerReason || 'none'}`,
    `- exitCode: ${receipt.exitCode ?? 'null'}`,
    `- firstOutputTimeout: ${receipt.firstOutputTimeout.timedOut}`,
    `- totalTimeout: ${receipt.totalTimeout.timedOut}`,
    `- fallbackWinner: ${receipt.fallbackWinner || 'none'}`,
    '',
  ].join('\n');
}

function safeSegment(value, fallback) {
  return (
    String(value || fallback)
      .replace(/[^a-z0-9_.-]/giu, '-')
      .slice(0, 80) || fallback
  );
}

function receiptDir() {
  return path.resolve('tmp', 'reviewer-routes');
}

export function writeRouteReceipt(receipt) {
  const safeDir = receiptDir();
  fs.mkdirSync(safeDir, { recursive: true, mode: 0o700 });
  const stamp = receipt.startedAt.replace(/[-:.]/g, '').slice(0, 15);
  const base = `${safeSegment(stamp, 'receipt')}-${safeSegment(receipt.routeName, 'route')}-${randomUUID()}`;
  const jsonPath = path.join(safeDir, `${base}.json`);
  const mdPath = path.join(safeDir, `${base}.md`);
  fs.writeFileSync(jsonPath, `${JSON.stringify(receipt, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  fs.writeFileSync(mdPath, receiptMarkdown(receipt), { flag: 'wx', mode: 0o600 });
  return { jsonPath, mdPath };
}
