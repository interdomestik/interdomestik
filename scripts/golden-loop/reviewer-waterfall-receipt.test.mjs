import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createReceiptWriter } from './reviewer-receipt.mjs';
import { runWaterfall } from './reviewer-waterfall.mjs';

const adapter = JSON.parse(
  fs.readFileSync(
    new URL('../../docs/golden-loop/adapters/interdomestik.adapter.json', import.meta.url),
    'utf8'
  )
);
const SLICE = 'T-002d';

function reviewerFor(route) {
  return Object.keys(adapter.reviewerWaterfall.routes).find(
    key => adapter.reviewerWaterfall.routes[key] === route
  );
}

test('blocked routes never count as approval', async () => {
  const outputs = {
    sonnet: { blocked: true, reason: 'quota_or_rate_limit' },
    gemini: { exitCode: 1, output: 'command failed' },
  };
  const { results, winner } = await runWaterfall(
    adapter.reviewerWaterfall.order,
    adapter.reviewerWaterfall.routes,
    'prompt',
    route => outputs[reviewerFor(route)],
    { sliceId: SLICE }
  );
  assert.equal(winner, null);
  assert.deepEqual(results.map(result => result.status), ['blocked', 'failed']);
});

test('waterfall receipt records external fallback winner', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'waterfall-receipt-'));
  try {
    const writer = createReceiptWriter({
      root,
      sliceId: SLICE,
      dryRun: false,
      timeoutMs: 1000,
      startedAt: new Date().toISOString(),
    });
    const receipt = writer.writeReceipt(
      [
        { routeName: 'sonnet', provider: 'anthropic', model: 'claude-sonnet-4-6', status: 'blocked' },
        { routeName: 'gemini', provider: 'google', model: 'gemini-3.1-pro-preview', status: 'ran' },
      ],
      { reviewer: 'gemini' },
      false
    );
    assert.equal(receipt.fallbackWinner, 'gemini');
    assert.match(fs.readFileSync(receipt.receiptMarkdown, 'utf8'), /gemini/u);
    assert.equal(JSON.parse(fs.readFileSync(receipt.receiptJson, 'utf8')).fallbackWinner, 'gemini');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
