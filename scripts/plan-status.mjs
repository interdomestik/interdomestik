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
const currentPhase = (extractSection(program, 'Current Phase').split(/\r?\n\s*\r?\n/u)[0] || 'n/a')
  .replace(/\s+/gu, ' ')
  .trim();
const goals = [];
for (const line of extractSection(program, 'Program Goals').split(/\r?\n/u)) {
  const start = line.trim().match(/^\d+\.\s+(.+)$/u);
  if (start) {
    goals.push(start[1]);
  } else if (line.trim() && goals.length > 0) {
    goals[goals.length - 1] += ` ${line.trim()}`;
  }
}
const { queueRows, proofRows } = parseTrackerDocument(tracker);
const proofById = new Map(proofRows.map(row => [row.id, row]));

console.log('=== Interdomestik Current Program Status ===');
console.log('Program: docs/plans/current-program.md');
console.log('Tracker: docs/plans/current-tracker.md');
console.log(`Current phase: ${currentPhase}`);
console.log('Legacy authority: explicit-only (run pnpm plan:audit:legacy when applicable)');

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

if (queueRows.length > 0) {
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
