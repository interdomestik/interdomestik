#!/usr/bin/env node

const path = require('node:path');

const { recordPilotDecisionProof } = require('./release-gate/pilot-artifacts.ts');

const ARG_KEYS = {
  '--reviewType': 'reviewType',
  '--reference': 'reference',
  '--date': 'date',
  '--owner': 'owner',
  '--decision': 'decision',
  '--rollbackTag': 'rollbackTarget',
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
  };
}

function parseArgs(argv) {
  const parsed = createEmptyArgs();

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];

    if (token === '--help' || token === '-h') {
      parsed.help = true;
      break;
    }

    const key = ARG_KEYS[token];
    if (key && next) {
      parsed[key] = next;
      index += 1;
    }
  }

  return parsed;
}

function printHelp() {
  console.log(
    [
      'Usage:',
      '  pnpm pilot:decision:record -- --pilotId <pilot-id> --reviewType <daily|weekly> --reference <day-<n>|week-<n>> --date <YYYY-MM-DD> --owner <name> --decision <continue|pause|hotfix|stop> [--rollbackTag <pilot-ready-YYYYMMDD|n/a>]',
      '',
      'Notes:',
      '  - Writes the decision proof row into the copied docs/pilot/PILOT_EVIDENCE_INDEX_<pilot-id>.md file.',
      '  - Hotfix and stop decisions require --rollbackTag pilot-ready-YYYYMMDD.',
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
  });

  console.log(`Updated ${path.relative(process.cwd(), result.evidenceIndexPath)}`);
  console.log(`Decision: ${result.decision}`);
  console.log(`Rollback target: ${result.rollbackTarget}`);
  console.log(
    `Resume requirements: pilot:check=${result.requirements.requiresPilotCheck}, release:gate=${result.requirements.requiresReleaseGate}`
  );
}

try {
  if (require.main === module) {
    main();
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

module.exports = {
  createEmptyArgs,
  parseArgs,
};
