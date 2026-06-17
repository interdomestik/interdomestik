import fs from 'node:fs';
import os from 'node:os';
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

function safeSegment(value, fallback) {
  return String(value || fallback).replace(/[^a-z0-9_.-]/giu, '-').slice(0, 80) || fallback;
}

function safeReceiptDir(receiptDir) {
  const resolved = path.resolve(receiptDir || path.join('tmp', 'reviewer-routes'));
  const allowedRoots = [process.cwd(), os.tmpdir()].map(root => path.resolve(root));
  if (!allowedRoots.some(root => resolved === root || resolved.startsWith(`${root}${path.sep}`))) {
    throw new Error(`receipt directory must be inside the repository or temp dir: ${receiptDir}`);
  }
  return resolved;
}

export function writeRouteReceipt(receipt, receiptDir = path.join('tmp', 'reviewer-routes')) {
  const safeDir = safeReceiptDir(receiptDir);
  fs.mkdirSync(safeDir, { recursive: true });
  const stamp = receipt.startedAt.replace(/[-:.]/g, '').slice(0, 15);
  const base = `${safeSegment(stamp, 'receipt')}-${safeSegment(receipt.routeName, 'route')}`;
  const jsonPath = path.join(safeDir, `${base}.json`);
  const mdPath = path.join(safeDir, `${base}.md`);
  fs.writeFileSync(jsonPath, `${JSON.stringify(receipt, null, 2)}\n`);
  fs.writeFileSync(mdPath, receiptMarkdown(receipt));
  return { jsonPath, mdPath };
}
