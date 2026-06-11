#!/usr/bin/env node
// Golden Loop adapter loader: validates a project adapter against the schema's
// required structure and verifies referenced files exist. Project-agnostic.
// Usage: node scripts/golden-loop/load-adapter.mjs --adapter <path> [--quiet]
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const SCHEMA_PATH = new URL('./adapter.schema.json', import.meta.url);

function argValue(args, name, fallback = '') {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

function collectRequired(schema, prefix, out) {
  if (!schema || typeof schema !== 'object') return out;
  for (const key of schema.required || []) {
    out.push(prefix ? `${prefix}.${key}` : key);
  }
  for (const [key, child] of Object.entries(schema.properties || {})) {
    if (child && child.type === 'object') {
      collectRequired(child, prefix ? `${prefix}.${key}` : key, out);
    }
  }
  return out;
}

function getPath(object, dottedPath) {
  return dottedPath
    .split('.')
    .reduce((value, key) => (value == null ? value : value[key]), object);
}

export function validateAdapter(adapter, schema) {
  const errors = [];
  for (const requiredPath of collectRequired(schema, '', [])) {
    const parent = requiredPath.includes('.')
      ? getPath(adapter, requiredPath.slice(0, requiredPath.lastIndexOf('.')))
      : adapter;
    if (parent === undefined) continue; // optional parent object absent
    if (getPath(adapter, requiredPath) === undefined) {
      errors.push(`missing required field: ${requiredPath}`);
    }
  }
  if (adapter.adapterVersion !== 1) errors.push('adapterVersion must be 1');
  const order = adapter.reviewerWaterfall?.order || [];
  const routes = adapter.reviewerWaterfall?.routes || {};
  for (const reviewer of order) {
    if (!routes[reviewer]) errors.push(`reviewerWaterfall.order entry has no route: ${reviewer}`);
  }
  for (const gate of adapter.gates || []) {
    if (!['fast', 'slice', 'full', 'remote'].includes(gate.costClass)) {
      errors.push(`gate ${gate.name} has invalid costClass: ${gate.costClass}`);
    }
  }
  return errors;
}

export function checkReferencedFiles(adapter) {
  const warnings = [];
  // Fall back to cwd when the declared repoRoot is not visible (e.g. sandboxed
  // or relocated checkouts) so reference checks stay meaningful everywhere.
  const root = fs.existsSync(adapter.repoRoot) ? adapter.repoRoot : process.cwd();
  const candidates = [
    ...(adapter.canonicalTrackers?.files || []),
    ...(adapter.protectedPaths || []),
  ];
  for (const candidate of candidates) {
    if (candidate.startsWith('user ') || candidate.includes(' ')) continue;
    const resolved = path.isAbsolute(candidate) ? candidate : path.join(root, candidate);
    if (!fs.existsSync(resolved)) warnings.push(`referenced path not found: ${candidate}`);
  }
  for (const entry of adapter.skillAuthorityPaths || []) {
    const resolved = path.isAbsolute(entry.path) ? entry.path : path.join(root, entry.path);
    if (fs.existsSync(resolved)) continue;
    // Optional, environment-specific skill paths warn but never fail validation.
    warnings.push(
      `skill authority path not found${entry.optional ? ' (optional)' : ''}: ${entry.path}`
    );
  }
  return warnings;
}

function main() {
  const args = process.argv.slice(2);
  const adapterPath = argValue(args, '--adapter', process.env.GOLDEN_LOOP_ADAPTER || '');
  if (!adapterPath) {
    console.error('load-adapter: missing --adapter <path> (or GOLDEN_LOOP_ADAPTER env)');
    process.exit(1);
  }
  const schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'));
  let adapter;
  try {
    adapter = JSON.parse(fs.readFileSync(adapterPath, 'utf8'));
  } catch (error) {
    console.error(`load-adapter: cannot read adapter: ${error.message}`);
    process.exit(1);
  }
  const errors = validateAdapter(adapter, schema);
  if (errors.length > 0) {
    console.error(`load-adapter: INVALID (${errors.length} error(s))`);
    for (const error of errors) console.error(`  - ${error}`);
    process.exit(1);
  }
  const warnings = checkReferencedFiles(adapter);
  for (const warning of warnings) console.error(`load-adapter: warning: ${warning}`);
  if (!args.includes('--quiet')) {
    console.log(JSON.stringify({ status: 'valid', project: adapter.project, warnings }, null, 2));
  }
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) main();
