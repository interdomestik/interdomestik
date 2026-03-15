#!/usr/bin/env node

const path = require('node:path');

const { recordPilotDailyEvidence } = require('./release-gate/pilot-artifacts.ts');

function parseArgs(argv) {
  const parsed = {
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

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];

    if ((token === '--help' || token === '-h') && !next) {
      parsed.help = true;
      continue;
    }
    if (token === '--pilotId' && next) {
      parsed.pilotId = next;
      index += 1;
      continue;
    }
    if (token === '--day' && next) {
      parsed.day = next;
      index += 1;
      continue;
    }
    if (token === '--date' && next) {
      parsed.date = next;
      index += 1;
      continue;
    }
    if (token === '--owner' && next) {
      parsed.owner = next;
      index += 1;
      continue;
    }
    if (token === '--status' && next) {
      parsed.status = next;
      index += 1;
      continue;
    }
    if (token === '--reportPath' && next) {
      parsed.reportPath = next;
      index += 1;
      continue;
    }
    if (token === '--bundlePath' && next) {
      parsed.bundlePath = next;
      index += 1;
      continue;
    }
    if (token === '--incidentCount' && next) {
      parsed.incidentCount = next;
      index += 1;
      continue;
    }
    if (token === '--highestSeverity' && next) {
      parsed.highestSeverity = next;
      index += 1;
      continue;
    }
    if (token === '--decision' && next) {
      parsed.decision = next;
      index += 1;
    }
  }

  return parsed;
}

function printHelp() {
  console.log(
    [
      'Usage:',
      '  pnpm pilot:evidence:record -- --pilotId <pilot-id> --day <n> --date <YYYY-MM-DD> --owner <name> --status <green|amber|red> --incidentCount <n> --highestSeverity <none|sev3|sev2|sev1> --decision <continue|defer|hotfix|stop> --bundlePath <path|n/a> [--reportPath <docs/release-gates/...>]',
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

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
