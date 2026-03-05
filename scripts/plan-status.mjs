#!/usr/bin/env node

import {
  PROGRAM_PATH,
  TRACKER_PATH,
  extractSection,
  parseTrackerDocument,
  readFileOrFail,
} from './plan-model.mjs';

const program = readFileOrFail(PROGRAM_PATH);
const tracker = readFileOrFail(TRACKER_PATH);
const currentPhase = (extractSection(program, 'Current Phase') || 'n/a').replace(/\n+/g, ' ');
const goals = extractSection(program, 'Program Goals')
  .split(/\r?\n/)
  .filter(line => /^\d+\./.test(line.trim()))
  .map(line => line.trim().replace(/^\d+\.\s*/, ''));
const { queueRows, proofRows } = parseTrackerDocument(tracker);
const proofById = new Map(proofRows.map(row => [row.id, row]));

console.log('=== Interdomestik Current Program Status ===');
console.log('Program: docs/plans/current-program.md');
console.log('Tracker: docs/plans/current-tracker.md');
console.log(`Current phase: ${currentPhase}`);

if (goals.length > 0) {
  console.log('\nProgram goals:');
  for (const goal of goals) {
    console.log(`- ${goal}`);
  }
}

if (queueRows.length > 0) {
  console.log('\nActive queue:');
  for (const item of queueRows) {
    console.log(`- ${item.id} [${item.status}] ${item.work} (owner: ${item.owner})`);
  }
}

if (proofRows.length > 0) {
  console.log('\nProof snapshot:');
  for (const item of queueRows) {
    const proof = proofById.get(item.id);

    if (!proof) {
      console.log(`- ${item.id} proof: missing`);
      continue;
    }

    console.log(
      `- ${item.id} proof: source=${proof.sourceRefs.join(', ')} exec=${proof.execution} run=${proof.runId} quality[sonar/docker/sentry]=${proof.sonar}/${proof.docker}/${proof.sentry} learning=${proof.learning}`
    );
  }
}
