import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import * as gateCommands from './z620-gate-command-lib.mjs';
import { paritySourcePaths } from './z620-parity-sources.mjs';
const excludedModes = new Set(['provider', 'release-only']);
export function workflowDigest(root, workflowPath) {
  return createHash('sha256')
    .update(fs.readFileSync(path.join(root, workflowPath)))
    .digest('hex');
}
function validateDigestSet(root, inventory, expectedPaths, kind) {
  const paths = gateCommands.sortedGateStrings(Object.keys(inventory ?? {}));
  if (!isDeepStrictEqual(paths, expectedPaths)) {
    return [`${kind} digest inventory does not match parity inventory`];
  }
  const problems = [];
  for (const filePath of expectedPaths) {
    try {
      if (workflowDigest(root, filePath) !== inventory[filePath]) {
        problems.push(`${filePath}: ${kind.toLowerCase()} changed without parity digest update`);
      }
    } catch {
      problems.push(`${filePath}: ${kind.toLowerCase()} changed without parity digest update`);
    }
  }
  return problems;
}
export function validateSourceDigests(root, parity) {
  return validateDigestSet(root, parity.sourceDigests, paritySourcePaths, 'Source');
}
export function validateWorkflowDigests(root, parity) {
  const workflows = gateCommands.sortedGateStrings(Object.keys(parity.workflows ?? {}));
  const workflowProblems = validateDigestSet(root, parity.workflowDigests, workflows, 'Workflow');
  return [...workflowProblems, ...validateSourceDigests(root, parity)];
}
export function requiredJobKeys(parity) {
  const keys = [];
  for (const [workflowPath, jobs] of Object.entries(parity.workflows ?? {})) {
    for (const [job, definition] of Object.entries(jobs)) {
      if (!excludedModes.has(definition[0])) keys.push(`${workflowPath}#${job}`);
    }
  }
  return gateCommands.sortedGateStrings(keys);
}
export function validateCommandCoverage(parity, gates) {
  const problems = [];
  const known = gateCommands.knownGateCommandIds();
  const exactSubstitutableCommands = gateCommands.exactSubstitutableGateCommandIds();
  const required = new Set(requiredJobKeys(parity));
  const commands = gates.substitutableCommands;
  if (!Array.isArray(commands)) return ['Substitutable command inventory must be an array'];
  if (!gateCommands.sortedUniqueGateStrings(commands))
    problems.push('Substitutable command inventory must be sorted and unique');
  const declared = new Set(commands.filter(commandId => typeof commandId === 'string'));
  for (const commandId of exactSubstitutableCommands)
    if (!declared.has(commandId)) problems.push(`${commandId}: missing substitutable command`);
  for (const commandId of declared)
    if (!known.has(commandId)) problems.push(`${commandId}: unknown gate command`);
    else if (!exactSubstitutableCommands.has(commandId))
      problems.push(`${commandId}: not exact-substitutable`);
  const metadataMap = gateCommands.isGateRecord(gates.commandMetadata) ? gates.commandMetadata : {};
  const coverageMap = gateCommands.isGateRecord(gates.commandCoverage) ? gates.commandCoverage : {};
  const jobMap = gateCommands.isGateRecord(gates.jobCommands) ? gates.jobCommands : {};
  if (!gateCommands.isGateRecord(gates.commandMetadata))
    problems.push('Command metadata must be an object');
  if (!gateCommands.isGateRecord(gates.commandCoverage))
    problems.push('Command coverage must be an object');
  if (!gateCommands.isGateRecord(gates.jobCommands))
    problems.push('Job commands must be an object');
  for (const commandId of Object.keys(metadataMap))
    if (!declared.has(commandId)) problems.push(`${commandId}: unknown command metadata`);
  for (const commandId of Object.keys(coverageMap))
    if (!declared.has(commandId)) problems.push(`${commandId}: unknown command coverage`);
  for (const commandId of declared) {
    const metadata = metadataMap[commandId];
    if (metadata === undefined) problems.push(`${commandId}: missing command metadata`);
    else problems.push(...gateCommands.validateGateCommandMetadata(commandId, metadata));
    const jobs = coverageMap[commandId];
    if (!Array.isArray(jobs) || jobs.length === 0) {
      problems.push(`${commandId}: missing CI counterpart`);
      continue;
    }
    if (!gateCommands.sortedUniqueGateStrings(jobs))
      problems.push(`${commandId}: duplicate CI job or unsorted coverage`);
    for (const job of jobs) {
      if (!required.has(job)) {
        problems.push(`${commandId}: unknown or excluded CI job ${JSON.stringify(job)}`);
        continue;
      }
      const lanes = gates.jobCoverage?.[job];
      if (!Array.isArray(lanes) || lanes.length === 0)
        problems.push(`${commandId}: missing forward job coverage ${job}`);
      else if (!lanes.some(lane => gates.lanes?.[lane]?.commands?.includes(commandId))) {
        problems.push(`${commandId}: ${job} forward coverage does not include command`);
      }
      const records = jobMap[job];
      const record = Array.isArray(records)
        ? records.find(item => item?.commandId === commandId)
        : undefined;
      if (
        !metadata ||
        gateCommands.validateGateCommandMetadata(commandId, metadata).length ||
        !record ||
        !isDeepStrictEqual(record, gateCommands.expectedGateCommandRecord(commandId, metadata))
      ) {
        problems.push(`${commandId}: workflow command/env/project/spec mismatch`);
      }
    }
  }
  for (const [job, records] of Object.entries(jobMap)) {
    if (!required.has(job)) problems.push(`${job}: unknown or excluded job commands`);
    if (!Array.isArray(records)) {
      problems.push(`${job}: job commands must be an array`);
      continue;
    }
    const ids = records.map(record => record?.commandId);
    if (new Set(ids).size !== ids.length) problems.push(`${job}: duplicate command ID`);
    for (const record of records) {
      if (!gateCommands.isGateRecord(record) || typeof record.commandId !== 'string') {
        problems.push(`${job}: invalid workflow command record`);
        continue;
      }
      problems.push(
        ...gateCommands.validateGateCommandMetadata(record.commandId, record, 'workflow command')
      );
      if (!Array.isArray(record.argv) || !record.argv.every(value => typeof value === 'string'))
        problems.push(`${record.commandId}: argv must be an array of strings`);
      if (
        !Array.isArray(coverageMap[record.commandId]) ||
        !coverageMap[record.commandId].includes(job)
      ) {
        problems.push(`${record.commandId}: missing reverse command coverage ${job}`);
      }
    }
  }
  return problems;
}
export const validateGateCoverage = (parity, gates) => [
  ...gateCommands.validateLaneCoverage(requiredJobKeys(parity), gates),
  ...validateCommandCoverage(parity, gates),
];
