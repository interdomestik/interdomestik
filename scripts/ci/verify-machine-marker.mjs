import { createHash } from 'node:crypto';
import { lstatSync, readFileSync } from 'node:fs';
import path from 'node:path';

// The owner creates this file with sudo; agents never create or edit it (AGENTS.md R-04).
export const MARKER_PATH = '/Library/Application Support/Interdomestik/verify-machine.json';
export const MARKER_SCHEMA = 'interdomestik.verify-machine/1';
export const REQUIRED_FORBIDDEN_PORTS = Object.freeze([3000, 54322]);
const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', 'localhost']);
const WRITABLE_BY_OTHERS = 0o022;
const DEFAULT_FS = Object.freeze({ lstatSync, readFileSync });

const KIND_CHECKS = {
  string: value => typeof value === 'string' && value.trim() !== '' && value.length <= 200,
  sha256: value => typeof value === 'string' && /^[0-9a-f]{64}$/u.test(value),
  port: value => Number.isInteger(value) && value > 0 && value < 65536,
  ports: value => Array.isArray(value) && value.length > 0 && value.every(KIND_CHECKS.port),
  positive: value => typeof value === 'number' && Number.isFinite(value) && value > 0,
};

const MARKER_SHAPE = Object.freeze({
  schema: 'string',
  created_at: 'string',
  machine: { hardware_uuid_sha256: 'sha256', arch: 'string' },
  os: { version: 'string', build: 'string' },
  node: 'string',
  pnpm: 'string',
  container_runtime: { context: 'string', engine: 'string' },
  database: { image: 'string', container: 'string', host: 'string', port: 'port', name: 'string' },
  app_port: 'port',
  forbidden_ports: 'ports',
  min_free_gib: 'positive',
});

export function sha256Hex(value) {
  return createHash('sha256').update(value).digest('hex');
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function shapeErrors(value, shape, prefix) {
  if (!isPlainObject(value)) return [`${prefix || 'marker '}must be an object`];
  const errors = Object.keys(value)
    .filter(key => !Object.hasOwn(shape, key))
    .map(key => `unknown field ${prefix}${key}`);
  for (const [key, kind] of Object.entries(shape)) {
    const field = `${prefix}${key}`;
    if (!Object.hasOwn(value, key)) errors.push(`missing field ${field}`);
    else if (typeof kind === 'object') errors.push(...shapeErrors(value[key], kind, `${field}.`));
    else if (!KIND_CHECKS[kind](value[key])) errors.push(`invalid field ${field}`);
  }
  return errors;
}

export function validateMarker(marker) {
  const errors = shapeErrors(marker, MARKER_SHAPE, '');
  if (errors.length > 0) return errors;
  if (marker.schema !== MARKER_SCHEMA) errors.push(`schema must be ${MARKER_SCHEMA}`);
  if (Number.isNaN(Date.parse(marker.created_at))) errors.push('created_at is not a date');
  for (const port of REQUIRED_FORBIDDEN_PORTS) {
    if (!marker.forbidden_ports.includes(port)) errors.push(`forbidden_ports must include ${port}`);
  }
  if (marker.forbidden_ports.includes(marker.database.port)) {
    errors.push('database.port is a forbidden port');
  }
  if (marker.forbidden_ports.includes(marker.app_port)) errors.push('app_port is a forbidden port');
  if (!LOOPBACK_HOSTS.has(marker.database.host)) errors.push('database.host must be loopback');
  if (!/@sha256:[0-9a-f]{64}$/u.test(marker.database.image)) {
    errors.push('database.image must be pinned by digest');
  }
  return errors;
}

function ownershipErrors(label, stat, expectFile) {
  const errors = [];
  if (expectFile ? !stat.isFile() : !stat.isDirectory()) {
    errors.push(`${label} must be a ${expectFile ? 'regular file' : 'directory'}, not a link`);
  }
  if (stat.uid !== 0) errors.push(`${label} must be owned by root`);
  if ((stat.mode & WRITABLE_BY_OTHERS) !== 0) {
    errors.push(`${label} must not be writable by group or others`);
  }
  return errors;
}

/**
 * Reads the marker only when root owns it and its directory and neither is writable by
 * anyone else, so a process running as the developer cannot forge or edit it.
 */
export function readTrustedMarker(markerPath = MARKER_PATH, fs = DEFAULT_FS) {
  let fileStat;
  try {
    fileStat = fs.lstatSync(markerPath);
  } catch (error) {
    if (error?.code === 'ENOENT') return { status: 'absent' };
    return { status: 'invalid', errors: [`marker cannot be read (${error?.code ?? 'error'})`] };
  }
  let dirStat;
  try {
    dirStat = fs.lstatSync(path.dirname(markerPath));
  } catch (error) {
    return { status: 'invalid', errors: [`marker directory cannot be read (${error?.code})`] };
  }
  const errors = [
    ...ownershipErrors('marker file', fileStat, true),
    ...ownershipErrors('marker directory', dirStat, false),
  ];
  if (errors.length > 0) return { status: 'invalid', errors };
  const bytes = fs.readFileSync(markerPath);
  let marker;
  try {
    marker = JSON.parse(bytes.toString('utf8'));
  } catch {
    return { status: 'invalid', errors: ['marker is not valid JSON'] };
  }
  const shapeProblems = validateMarker(marker);
  if (shapeProblems.length > 0) return { status: 'invalid', errors: shapeProblems };
  return { status: 'trusted', marker, sha256: sha256Hex(bytes) };
}
