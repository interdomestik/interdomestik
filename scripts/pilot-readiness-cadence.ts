#!/usr/bin/env node

const path = require('node:path');

const { createArgParser, runCli } = require('./pilot-artifact-cli.ts');
const { evaluatePilotReadinessCadence } = require('./release-gate/pilot-artifacts.ts');

const ARG_KEYS = {
  '--pilotId': 'pilotId',
  '--requiredStreak': 'requiredStreak',
};

function createEmptyArgs() {
  return {
    pilotId: '',
    requiredStreak: '',
  };
}

const parseArgs = createArgParser(ARG_KEYS, createEmptyArgs);

function printHelp() {
  console.log(
    [
      'Usage:',
      '  pnpm pilot:cadence:check -- --pilotId <pilot-id> [--requiredStreak <n>]',
      '',
      'Notes:',
      '  - Reads the latest canonical pilot-entry row for the pilot id from docs/pilot-evidence/index.csv.',
      '  - Evaluates the copied docs/pilot/PILOT_EVIDENCE_INDEX_<pilot-id>.md file for consecutive qualifying green days.',
      '  - Default required streak is 3 qualifying green operating days.',
    ].join('\n')
  );
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const result = evaluatePilotReadinessCadence({
    rootDir: path.resolve(__dirname, '..'),
    pilotId: args.pilotId,
    requiredStreak: args.requiredStreak,
  });

  console.log(
    `Pilot ${args.pilotId} readiness cadence: ${result.satisfied ? 'PASS' : 'FAIL'}`
  );
  console.log(`Required streak: ${result.requiredStreak}`);
  console.log(`Longest qualifying streak: ${result.longestStreak}`);
  console.log(`Evidence index: ${path.relative(process.cwd(), result.evidenceIndexPath)}`);
  console.log(
    `Qualifying dates: ${result.qualifyingDates.length ? result.qualifyingDates.join(', ') : 'none'}`
  );

  if (!result.satisfied) {
    throw new Error(
      `pilot ${args.pilotId} requires ${result.requiredStreak} consecutive qualifying green days; longest repo-backed streak is ${result.longestStreak}`
    );
  }
}

runCli(main);

module.exports = {
  createEmptyArgs,
  parseArgs,
};
