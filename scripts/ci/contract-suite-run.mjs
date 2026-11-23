#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { selectRepository } from './contract-suite-surface.mjs';
import { contractTestPlan, runParallel } from './contract-test-shards.mjs';

export async function runContractSuite(selectLane = selectRepository) {
  let selection;
  try {
    selection = selectLane();
  } catch {
    selection = { lane: 'full', reason: 'selector-error' };
  }

  // Only an explicit product selection narrows the suite; anything else runs, and reports, full.
  const { lane, reason } =
    selection?.lane === 'product' || selection?.lane === 'full'
      ? selection
      : { lane: 'full', reason: 'unknown-lane' };
  process.stdout.write(`contract lane: ${lane} (${reason})\n`);

  const { shards } = contractTestPlan();
  let select;
  if (lane === 'product') {
    const list = JSON.parse(
      readFileSync(new URL('./contract-tooling-only.json', import.meta.url), 'utf8')
    );
    const toolingOnly = new Set(list.files);
    select = files => files.filter(file => !toolingOnly.has(file));
  }

  let total = 0;
  for (const [name, files] of Object.entries(shards)) {
    const count = select ? select(files).length : files.length;
    total += count;
    process.stdout.write(`contract shard ${name}: ${count} selected file(s)\n`);
  }

  if (!select) return await runParallel();
  if (total === 0) {
    process.stderr.write('contract product lane selected no test files\n');
    return 1;
  }
  return await runParallel({ select });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await runContractSuite();
}
