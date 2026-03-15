#!/usr/bin/env node

const path = require('node:path');

const { createArgParser, runCli } = require('./pilot-artifact-cli.ts');
const { recordPilotDailyEvidence } = require('./release-gate/pilot-artifacts.ts');

const ARG_KEYS = {
  '--pilotId': 'pilotId',
  '--day': 'day',
  '--date': 'date',
  '--owner': 'owner',
  '--status': 'status',
  '--reportPath': 'reportPath',
  '--bundlePath': 'bundlePath',
  '--incidentCount': 'incidentCount',
  '--highestSeverity': 'highestSeverity',
  '--decision': 'decision',
};

function createEmptyArgs() {
  return {
    pilotId: '',
    day: '',
    date: '',
    owner: '',
    status: '',
    reportPath: '',
    bundlePath: '',
    incidentCount: '',
    highestSeverity: '',
    decision: '',
  };
}

const parseArgs = createArgParser(ARG_KEYS, createEmptyArgs);

function printHelp() {
  console.log(
    [
      'Usage:',
      '  pnpm pilot:evidence:record -- --pilotId <pilot-id> --day <n> --date <YYYY-MM-DD> --owner <name> --status <green|amber|red> --incidentCount <n> --highestSeverity <none|sev3|sev2|sev1> --decision <continue|pause|hotfix|stop> --bundlePath <path|n/a> [--reportPath <docs/release-gates/...>]',
      '',
      'Notes:',
      '  - Requires an existing canonical pilot-entry artifact set for the pilot id.',
      '  - Updates docs/pilot/PILOT_EVIDENCE_INDEX_<pilot-id>.md in place.',
      '  - Reuses docs/pilot-evidence/index.csv only to locate the copied evidence index and the latest pilot-entry release report.',
    ].join('\n')
  );
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const result = recordPilotDailyEvidence({
    rootDir: path.resolve(__dirname, '..'),
    pilotId: args.pilotId,
    day: args.day,
    date: args.date,
    owner: args.owner,
    status: args.status,
    reportPath: args.reportPath,
    bundlePath: args.bundlePath,
    incidentCount: args.incidentCount,
    highestSeverity: args.highestSeverity,
    decision: args.decision,
  });

  console.log(`Updated ${path.relative(process.cwd(), result.evidenceIndexPath)}`);
  console.log(`Release report path: ${result.reportPath}`);
}

runCli(main);

module.exports = {
  createEmptyArgs,
  parseArgs,
};
