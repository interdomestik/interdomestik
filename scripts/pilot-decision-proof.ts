#!/usr/bin/env node

const path = require('node:path');

const { createArgParser, runCli } = require('./pilot-artifact-cli.ts');
const { recordPilotDecisionProof } = require('./release-gate/pilot-artifacts.ts');

const ARG_KEYS = {
  '--reviewType': 'reviewType',
  '--reference': 'reference',
  '--date': 'date',
  '--owner': 'owner',
  '--decision': 'decision',
  '--rollbackTag': 'rollbackTarget',
  '--observabilityRef': 'observabilityReference',
  '--pilotId': 'pilotId',
};

function createEmptyArgs() {
  return {
    pilotId: '',
    reviewType: '',
    reference: '',
    date: '',
    owner: '',
    decision: '',
    rollbackTarget: '',
    observabilityReference: '',
  };
}

const parseArgs = createArgParser(ARG_KEYS, createEmptyArgs);

function printHelp() {
  console.log(
    [
      'Usage:',
      '  pnpm pilot:decision:record -- --pilotId <pilot-id> --reviewType <daily|weekly> --reference <day-<n>|week-<n>> --date <YYYY-MM-DD> --owner <name> --decision <continue|pause|hotfix|stop> [--rollbackTag <pilot-ready-YYYYMMDD|n/a>] [--observabilityRef <day-<n>|week-<n>>]',
      '',
      'Notes:',
      '  - Writes the decision proof row into the copied docs/pilot/PILOT_EVIDENCE_INDEX_<pilot-id>.md file.',
      '  - Hotfix and stop decisions require --rollbackTag pilot-ready-YYYYMMDD.',
      '  - --observabilityRef defaults to the same review reference and must already exist in the observability log.',
      '  - Resume re-validation requirements are derived automatically from the decision matrix.',
    ].join('\n')
  );
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const result = recordPilotDecisionProof({
    rootDir: path.resolve(__dirname, '..'),
    pilotId: args.pilotId,
    reviewType: args.reviewType,
    reference: args.reference,
    date: args.date,
    owner: args.owner,
    decision: args.decision,
    rollbackTarget: args.rollbackTarget,
    observabilityReference: args.observabilityReference,
  });

  console.log(`Updated ${path.relative(process.cwd(), result.evidenceIndexPath)}`);
  console.log(`Decision: ${result.decision}`);
  console.log(`Rollback target: ${result.rollbackTarget}`);
  console.log(`Observability ref: ${result.observabilityReference}`);
  console.log(
    `Resume requirements: pilot:check=${result.requirements.requiresPilotCheck}, release:gate=${result.requirements.requiresReleaseGate}`
  );
}

runCli(main);

module.exports = {
  createEmptyArgs,
  parseArgs,
};
