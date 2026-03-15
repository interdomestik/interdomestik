#!/usr/bin/env node

const path = require('node:path');

const { createArgParser, runCli } = require('./pilot-artifact-cli.ts');
const { recordPilotObservabilityEvidence } = require('./release-gate/pilot-artifacts.ts');

const ARG_KEYS = {
  '--pilotId': 'pilotId',
  '--reference': 'reference',
  '--date': 'date',
  '--owner': 'owner',
  '--logSweepResult': 'logSweepResult',
  '--functionalErrorCount': 'functionalErrorCount',
  '--expectedAuthDenyCount': 'expectedAuthDenyCount',
  '--kpiCondition': 'kpiCondition',
  '--incidentCount': 'incidentCount',
  '--highestSeverity': 'highestSeverity',
  '--notes': 'notes',
};

function createEmptyArgs() {
  return {
    pilotId: '',
    reference: '',
    date: '',
    owner: '',
    logSweepResult: '',
    functionalErrorCount: '',
    expectedAuthDenyCount: '',
    kpiCondition: '',
    incidentCount: '',
    highestSeverity: '',
    notes: '',
  };
}

const parseArgs = createArgParser(ARG_KEYS, createEmptyArgs);

function printHelp() {
  console.log(
    [
      'Usage:',
      '  pnpm pilot:observability:record -- --pilotId <pilot-id> --reference <day-<n>|week-<n>> --date <YYYY-MM-DD> --owner <name> --logSweepResult <clear|expected-noise|action-required> --functionalErrorCount <n> --expectedAuthDenyCount <n> --kpiCondition <within-threshold|watch|breach> --incidentCount <n> --highestSeverity <none|sev3|sev2|sev1> --notes <text|n/a>',
      '',
      'Notes:',
      '  - Requires an existing canonical pilot-entry artifact set for the pilot id.',
      '  - Updates the observability evidence log inside docs/pilot/PILOT_EVIDENCE_INDEX_<pilot-id>.md.',
      '  - Keeps log-sweep result, KPI condition, and incident severity repo-backed for later decision rows.',
    ].join('\n')
  );
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const result = recordPilotObservabilityEvidence({
    rootDir: path.resolve(__dirname, '..'),
    pilotId: args.pilotId,
    reference: args.reference,
    date: args.date,
    owner: args.owner,
    logSweepResult: args.logSweepResult,
    functionalErrorCount: args.functionalErrorCount,
    expectedAuthDenyCount: args.expectedAuthDenyCount,
    kpiCondition: args.kpiCondition,
    incidentCount: args.incidentCount,
    highestSeverity: args.highestSeverity,
    notes: args.notes,
  });

  console.log(`Updated ${path.relative(process.cwd(), result.evidenceIndexPath)}`);
  console.log(`Observability reference: ${result.reference}`);
}

runCli(main);

module.exports = {
  createEmptyArgs,
  parseArgs,
};
