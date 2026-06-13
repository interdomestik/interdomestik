#!/usr/bin/env node

import { evaluateMultiAgentPolicy, evaluatePackageJsonRisk } from './multi-agent-policy-lib.mjs';
import {
  parsePolicyArgs,
  readChangedFiles,
  readEvent,
  readPackageJsonDiff,
} from './policy-cli-common-lib.mjs';

function readLabels(event) {
  return (event?.pull_request?.labels || []).map(label => label?.name || '');
}

async function resolvePackageJsonRisk({ event, changedFiles }) {
  const packageJsonDiff = await readPackageJsonDiff({ event, changedFiles });
  if (!packageJsonDiff) {
    return null;
  }

  if (!packageJsonDiff.available) {
    return {
      shouldRun: true,
      matchedPaths: [`package.json:${packageJsonDiff.error}`],
    };
  }

  return evaluatePackageJsonRisk(packageJsonDiff);
}

const { eventName, eventPath, changedFilesPath } = parsePolicyArgs(
  process.argv.slice(2),
  'multi-agent-policy'
);
const event = readEvent(eventPath);
const changedFiles = readChangedFiles(changedFilesPath);
const result = evaluateMultiAgentPolicy({
  eventName,
  labels: readLabels(event),
  changedFiles,
  packageJsonRisk: await resolvePackageJsonRisk({
    event,
    changedFiles,
  }),
});

process.stdout.write(`should_run=${String(result.shouldRun)}\n`);
process.stdout.write(`reason=${result.reason}\n`);
process.stdout.write(`matched_paths=${JSON.stringify(result.matchedPaths)}\n`);
