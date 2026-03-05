#!/usr/bin/env node

import fs from 'node:fs';

import {
  PROGRAM_PATH,
  TRACKER_PATH,
  parseTrackerDocument,
  readFileOrFail,
  resolveRepoPath,
} from './plan-model.mjs';

function evidencePresence(root, refs) {
  let present = 0;

  for (const ref of refs) {
    if (fs.existsSync(resolveRepoPath(root, ref))) {
      present += 1;
    }
  }

  return {
    present,
    total: refs.length,
  };
}

function runRootState(root, runRoot) {
  if (['missing', 'pending', 'blocked', 'not_applicable'].includes(runRoot)) {
    return runRoot;
  }

  return fs.existsSync(resolveRepoPath(root, runRoot)) ? 'present' : 'missing';
}

readFileOrFail(PROGRAM_PATH, 'plan:proof');
const tracker = readFileOrFail(TRACKER_PATH, 'plan:proof');
const { queueRows, proofRows } = parseTrackerDocument(tracker);
const proofById = new Map(proofRows.map(row => [row.id, row]));

console.log('=== Interdomestik Plan Proof ===');
console.log('Program: docs/plans/current-program.md');
console.log('Tracker: docs/plans/current-tracker.md');

for (const item of queueRows) {
  const proof = proofById.get(item.id);

  if (!proof) {
    console.log(`\n- ${item.id} [${item.status}] ${item.work}`);
    console.log('  proof: missing');
    continue;
  }

  const presence = evidencePresence(process.cwd(), proof.evidenceRefs);

  console.log(`\n- ${item.id} [${item.status}] ${item.work}`);
  console.log(`  source: ${proof.sourceRefs.join(', ')}`);
  console.log(`  execution: ${proof.execution} | run: ${proof.runId}`);
  console.log(`  run_root: ${proof.runRoot} [${runRootState(process.cwd(), proof.runRoot)}]`);
  console.log(
    `  quality: sonar=${proof.sonar} docker=${proof.docker} sentry=${proof.sentry} | learning=${proof.learning}`
  );
  console.log(`  evidence present: ${presence.present}/${presence.total}`);
}
