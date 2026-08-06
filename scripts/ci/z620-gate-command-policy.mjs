import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import {
  exactSubstitutableGateCommandIds,
  expectedGateCommandRecord,
  knownGateCommandIds,
  resolveGateCommand,
} from './z620-gate-command-lib.mjs';

export { exactSubstitutableGateCommandIds, expectedGateCommandRecord, knownGateCommandIds };

const compare = (left, right) => left.localeCompare(right);
export const sortedGateStrings = values => [...values].sort(compare);
export const isGateRecord = value =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
export const sortedUniqueGateStrings = values =>
  Array.isArray(values) &&
  values.every(value => typeof value === 'string') &&
  isDeepStrictEqual(values, sortedGateStrings(new Set(values)));
const safeSpec = value =>
  typeof value === 'string' &&
  value.startsWith('e2e/') &&
  !value.includes('\\') &&
  !path.posix.isAbsolute(value) &&
  path.posix.normalize(value) === value;

export function validateGateCommandMetadata(commandId, metadata, label = 'metadata') {
  if (!isGateRecord(metadata)) return [`${commandId}: ${label} must be an object`];
  const problems = [];
  const allowed =
    label === 'metadata'
      ? ['env', 'projects', 'specs']
      : ['argv', 'commandId', 'env', 'projects', 'specs'];
  for (const key of Object.keys(metadata)) {
    if (!allowed.includes(key)) problems.push(`${commandId}: unknown ${label} key ${key}`);
  }
  const validEnv =
    isGateRecord(metadata.env) &&
    Object.values(metadata.env).every(value => typeof value === 'string');
  if (!isGateRecord(metadata.env)) problems.push(`${commandId}: env must be an object`);
  else if (!validEnv) problems.push(`${commandId}: env values must be strings`);
  if (
    label === 'metadata' &&
    validEnv &&
    knownGateCommandIds().has(commandId) &&
    !isDeepStrictEqual(metadata.env, resolveGateCommand(commandId).normalizedEnvContract)
  ) {
    problems.push(`${commandId}: env must match static command env contract`);
  }
  for (const key of ['projects', 'specs']) {
    if (!Array.isArray(metadata[key])) problems.push(`${commandId}: ${key} must be an array`);
    else if (!sortedUniqueGateStrings(metadata[key])) {
      problems.push(`${commandId}: ${key} must be sorted and unique`);
    }
  }
  if (Array.isArray(metadata.specs)) {
    for (const spec of metadata.specs) {
      if (!safeSpec(spec)) problems.push(`${commandId}: unsafe spec ${JSON.stringify(spec)}`);
    }
  }
  return problems;
}

export function validateGateCommandIds(gates) {
  const problems = [];
  const known = knownGateCommandIds();
  for (const [lane, definition] of Object.entries(gates.lanes ?? {})) {
    for (const commandId of definition.commands ?? []) {
      if (typeof commandId !== 'string' || !known.has(commandId)) {
        problems.push(`${lane}: unknown gate command ${JSON.stringify(commandId)}`);
      }
    }
  }
  return problems;
}

export function validateLaneCoverage(required, gates) {
  const covered = sortedGateStrings(Object.keys(gates.jobCoverage ?? {}));
  const problems = [];
  for (const key of required)
    if (!covered.includes(key)) problems.push(`${key}: missing local gate coverage`);
  for (const key of covered) {
    if (!required.includes(key)) problems.push(`${key}: unknown or excluded job coverage`);
    const lanes = gates.jobCoverage[key];
    if (!Array.isArray(lanes) || lanes.length === 0)
      problems.push(`${key}: local gate coverage must name a lane`);
    else
      for (const lane of lanes)
        if (!gates.lanes?.[lane]) problems.push(`${key}: unknown lane ${lane}`);
  }
  for (const [lane, definition] of Object.entries(gates.lanes ?? {})) {
    if (!Array.isArray(definition.commands) || definition.commands.length === 0)
      problems.push(`${lane}: lane has no commands`);
  }
  return problems;
}
