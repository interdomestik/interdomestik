// The public-entry registry (design §1.3, §6.2): one file read by the app and by this scanner.
import fs from 'node:fs';
import path from 'node:path';

import { ScanError } from './ast.mjs';

export const REGISTRY_PATH = 'apps/web/src/lib/public-entry-points.json';
export const ROUTE_METHODS = Object.freeze([
  'GET',
  'HEAD',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'OPTIONS',
]);
export const AUTHENTICATION_LABELS = Object.freeze([
  'signature',
  'secret-header',
  'token',
  'library',
  'closed-410',
]);
const ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/u;
const NAME_RE = /^[A-Za-z_$][\w$]*$/u;
const COMMON = ['id', 'kind', 'writes', 'closedBy', 'source'];
const SHAPES = {
  'server-action': [...COMMON, 'module', 'export', 'operation', 'rateLimit', 'aliases'],
  route: [...COMMON, 'module', 'method', 'authentication', 'effect', 'deniedTest'],
  page: [...COMMON, 'page'],
  'auth-mechanism': [...COMMON, 'module', 'export', 'configKey', 'plugin'],
};
const OPTIONAL = new Set(['aliases', 'configKey', 'plugin', 'effect']);
const isPlainObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const isText = value => typeof value === 'string' && value.length > 0;
const isPositive = value => Number.isSafeInteger(value) && value > 0;

function fail(entry, message) {
  throw new ScanError(`registry entry ${entry?.id ?? '?'}: ${message}`);
}

function validateRateLimit(entry) {
  const limit = entry.rateLimit;
  if (limit === null) return;
  if (!isPlainObject(limit) || !isPositive(limit.limit) || !isPositive(limit.windowSeconds))
    fail(entry, 'rateLimit needs positive integer limit and windowSeconds, or null');
}

const KIND_RULES = {
  'server-action': entry => {
    if (!isText(entry.module) || !NAME_RE.test(entry.export ?? ''))
      fail(entry, 'needs module and export');
    if (entry.operation !== null && !isText(entry.operation))
      fail(entry, 'operation must be text or null');
    validateRateLimit(entry);
    if (
      entry.aliases !== undefined &&
      !(Array.isArray(entry.aliases) && entry.aliases.every(isText))
    )
      fail(entry, 'aliases must be a list of module#export');
  },
  route: entry => {
    if (!isText(entry.module) || !entry.module.endsWith('/route.ts'))
      fail(entry, 'module must be a route.ts');
    if (!ROUTE_METHODS.includes(entry.method)) fail(entry, 'unknown method');
    if (!AUTHENTICATION_LABELS.includes(entry.authentication))
      fail(entry, 'unknown authentication label');
    if (entry.authentication !== 'closed-410' && !NAME_RE.test(entry.effect ?? ''))
      fail(entry, 'needs the protected effect');
    const test = entry.deniedTest;
    if (!isPlainObject(test) || !isText(test.path) || !isText(test.title))
      fail(entry, 'needs deniedTest');
  },
  page: entry => {
    if (!isText(entry.page) || !entry.page.endsWith('/page.tsx'))
      fail(entry, 'page must be a page.tsx');
  },
  'auth-mechanism': entry => {
    if (!isText(entry.module) || !NAME_RE.test(entry.export ?? ''))
      fail(entry, 'needs module and export');
    if (isText(entry.configKey) === isText(entry.plugin))
      fail(entry, 'needs exactly one of configKey and plugin');
  },
};

function validateEntry(entry) {
  if (!isPlainObject(entry)) fail(entry, 'is not an object');
  if (!ID_RE.test(entry.id ?? '')) fail(entry, 'has an invalid id');
  const shape = SHAPES[entry.kind];
  if (!shape) fail(entry, 'has an unknown kind');
  for (const key of Object.keys(entry))
    if (!shape.includes(key)) fail(entry, `has an unknown key ${key}`);
  for (const key of shape) if (!OPTIONAL.has(key) && !(key in entry)) fail(entry, `has no ${key}`);
  if (typeof entry.writes !== 'boolean') fail(entry, 'writes must be a boolean');
  // Part 1: no closure predicate exists yet (WP-10), so every entry is an open baseline item.
  if (entry.closedBy !== null) fail(entry, 'closedBy must be null in part 1');
  if (!isText(entry.source)) fail(entry, 'needs its inventory source');
  KIND_RULES[entry.kind](entry);
}

export function parseRegistry(text) {
  if (typeof text !== 'string' || !text.trim()) throw new ScanError('registry is missing or empty');
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new ScanError('registry is not valid JSON');
  }
  if (!isPlainObject(data) || data.version !== 1 || !Array.isArray(data.entries))
    throw new ScanError('registry needs version 1 and an entries list');
  if (data.entries.length === 0) throw new ScanError('registry has no entries');
  const ids = new Set();
  for (const entry of data.entries) {
    validateEntry(entry);
    if (ids.has(entry.id)) fail(entry, 'duplicate id');
    ids.add(entry.id);
  }
  return data;
}

export function loadRegistry(root) {
  const file = path.join(root, REGISTRY_PATH);
  return parseRegistry(fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '');
}
