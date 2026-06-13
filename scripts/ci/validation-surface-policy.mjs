#!/usr/bin/env node

import {
  parsePolicyArgs,
  readChangedFiles,
  readEvent,
  readPackageJsonDiff,
} from './policy-cli-common-lib.mjs';
import {
  evaluatePackageJsonValidationSurface,
  evaluateValidationSurface,
} from './validation-surface-policy-lib.mjs';

async function resolvePackageJsonSurface({ event, changedFiles }) {
  const packageJsonDiff = await readPackageJsonDiff({ event, changedFiles });
  if (!packageJsonDiff) {
    return null;
  }

  if (!packageJsonDiff.available) {
    return { isNonProductOnly: false };
  }

  return evaluatePackageJsonValidationSurface(packageJsonDiff);
}

const { eventName, eventPath, changedFilesPath } = parsePolicyArgs(
  process.argv.slice(2),
  'validation-surface-policy'
);
const event = readEvent(eventPath);
const changedFiles = readChangedFiles(changedFilesPath);
const result = evaluateValidationSurface({
  eventName,
  changedFiles,
  packageJsonSurface: await resolvePackageJsonSurface({ event, changedFiles }),
});

process.stdout.write(`should_run=${String(result.shouldRun)}\n`);
process.stdout.write(`reason=${result.reason}\n`);
process.stdout.write(`non_product_only_paths=${JSON.stringify(result.nonProductOnlyPaths)}\n`);
