import fs from 'node:fs';
import path from 'node:path';

function receiptMarkdown(receipt) {
  return [
    `# Reviewer Route Receipt: ${receipt.routeName}`,
    '',
    `- status: ${receipt.status}`,
    `- model/provider: ${receipt.model}/${receipt.provider}`,
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

export function writeRouteReceipt(receipt, receiptDir = path.join('tmp', 'reviewer-routes')) {
  fs.mkdirSync(receiptDir, { recursive: true });
  const stamp = receipt.startedAt.replace(/[-:.]/g, '').slice(0, 15);
  const base = `${stamp}-${receipt.routeName}`;
  const jsonPath = path.join(receiptDir, `${base}.json`);
  const mdPath = path.join(receiptDir, `${base}.md`);
  fs.writeFileSync(jsonPath, `${JSON.stringify(receipt, null, 2)}\n`);
  fs.writeFileSync(mdPath, receiptMarkdown(receipt));
  return { jsonPath, mdPath };
}
