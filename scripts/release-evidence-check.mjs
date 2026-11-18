#!/usr/bin/env node
// Release evidence check. The manifest is a hash manifest: per gate it records the status, the
// signoff role and date, an opaque signer reference and the SHA-256 of each evidence file. The
// files and the signers' names are kept outside the repository. `--evidence-root <dir>`
// (pnpm release:evidence:verify <dir>) verifies the files in that directory against the recorded
// hashes; `--manifest-only` (pnpm release:evidence:check) checks the manifest alone. The manifest
// is read from the repository in the working directory. The root and its parent directories
// must stay trusted and unchanged while the check runs: each file is checked, then read by name.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { parseArgs } from 'node:util';
import yaml from 'js-yaml';

const rootDir = process.cwd();
const manifestFile = 'docs/release/production-evidence.yaml';
const passingStatuses = new Set(['supplied', 'approved', 'verified', 'waived']);
const passingStatusList = Array.from(passingStatuses).join(', ');
const requiredGateFields = [
  'id',
  'description',
  'required_artifacts',
  'owner',
  'status',
  'signoff',
];
const requiredSignoffFields = ['signer_ref', 'role', 'signed_at'];
const identifyingSignoffFields = ['name', 'email'];
const textSignoffFields = ['signer_ref', 'role'];
// The schema's closed key sets; name and email keep their own message.
const knownSignoffFields = new Set([...requiredSignoffFields, ...identifyingSignoffFields]);
const artifactFields = new Set(['file', 'sha256', 'path']);
const manifestFields = new Set(['gates']);
const gateFields = new Set(requiredGateFields);
const textGateFields = ['description', 'owner'];
const GATE_ID_PATTERN = /^G(?:0[1-9]|10)$/u;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;

// A calendar date written YYYY-MM-DD; the core schema keeps it as text, so 2026-02-30 is refused
// instead of rolling over.
function isSignoffDate(value) {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const FILE_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/u;

// Exactly one mode: `--manifest-only` or `--evidence-root <dir>`. The package scripts name it
// (release:evidence:check, release:evidence:verify), so an option pnpm drops leaves either no mode
// or a valueless --evidence-root. An unknown, repeated or valueless option stops the check.
const RESERVED_CONFIG = new Set(['manifest', 'manifestonly', 'evidenceroot']);

function readOptions(argv) {
  // pnpm takes options written before the script name as its own configuration and exports them as
  // npm_config_* variables in the spelling and case they were given, so compare normalised names.
  for (const key of Object.keys(process.env)) {
    const match = /^npm_config_(.+)$/iu.exec(key);
    if (match && RESERVED_CONFIG.has(match[1].toLowerCase().replace(/[-_]/gu, ''))) {
      throw new Error(`invalid arguments: ${key} is set; write options after the script name`);
    }
  }
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      strict: true,
      allowPositionals: false,
      tokens: true,
      options: { 'manifest-only': { type: 'boolean' }, 'evidence-root': { type: 'string' } },
    });
  } catch (error) {
    throw new Error(`invalid arguments: ${error.message}`);
  }
  const seen = new Set();
  for (const token of parsed.tokens) {
    if (token.kind !== 'option') continue;
    if (seen.has(token.name)) throw new Error(`invalid arguments: --${token.name} given twice`);
    seen.add(token.name);
    if (token.name === 'evidence-root' && !token.value) {
      throw new Error('invalid arguments: --evidence-root needs a value');
    }
  }
  if (seen.size !== 1) {
    throw new Error('invalid arguments: give either --manifest-only or --evidence-root <dir>');
  }
  return parsed.values;
}

function readManifest(filePath) {
  const absolute = path.resolve(rootDir, filePath);
  if (!fs.existsSync(absolute)) throw new Error(`manifest not found: ${filePath}`);
  // The core schema has no merge keys or timestamps: `<<` stays a literal key that the closed key
  // sets refuse, so a merged mapping cannot carry a name past the checks.
  return yaml.load(fs.readFileSync(absolute, 'utf8'), { schema: yaml.CORE_SCHEMA });
}

function readEvidenceRoot(value) {
  if (value == null) return null;
  const absolute = path.resolve(rootDir, value);
  if (!fs.existsSync(absolute) || !fs.statSync(absolute).isDirectory()) {
    throw new Error(`evidence root is not a directory: ${value}`);
  }
  return fs.realpathSync(absolute);
}

function isPending(value) {
  return (
    value == null || String(value).trim() === '' || String(value).trim().toLowerCase() === 'pending'
  );
}

function sha256(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function validateGateShape(gate) {
  if (!isRecord(gate)) return ['gate entry is invalid'];
  const errors = [];
  for (const field of Object.keys(gate)) {
    if (!gateFields.has(field)) errors.push(`${field} is not accepted`);
  }
  for (const field of requiredGateFields) {
    if (gate[field] == null || gate[field] === '') errors.push(`missing ${field}`);
  }
  if (gate.id != null && !(typeof gate.id === 'string' && GATE_ID_PATTERN.test(gate.id))) {
    errors.push('id must be one of G01-G10');
  }
  for (const field of textGateFields) {
    if (gate[field] != null && typeof gate[field] !== 'string')
      errors.push(`${field} must be text`);
  }
  if (!Array.isArray(gate.required_artifacts) || gate.required_artifacts.length === 0) {
    errors.push('required_artifacts must list at least one artifact');
  }
  if (gate.signoff != null && (typeof gate.signoff !== 'object' || Array.isArray(gate.signoff))) {
    errors.push('signoff must be an object');
  }
  return errors;
}

function validateSignoff(gate) {
  const errors = identifyingSignoffFields
    .filter(field => Object.hasOwn(gate.signoff ?? {}, field))
    .map(field => `${gate.id}: signoff.${field} must not be recorded here; use signer_ref`);
  for (const field of Object.keys(gate.signoff ?? {})) {
    if (!knownSignoffFields.has(field)) errors.push(`${gate.id}: signoff.${field} is not accepted`);
  }
  const signedAt = gate.signoff?.signed_at;
  if (!isPending(signedAt) && !isSignoffDate(signedAt)) {
    errors.push(`${gate.id}: signoff.signed_at must be a date`);
  }
  for (const field of textSignoffFields) {
    const value = gate.signoff?.[field];
    if (value != null && typeof value !== 'string') {
      errors.push(`${gate.id}: signoff.${field} must be text`);
    }
  }
  for (const field of requiredSignoffFields) {
    if (isPending(gate.signoff?.[field]))
      errors.push(`${gate.id}: signoff.${field} is missing or pending`);
  }
  return errors;
}

function validateArtifact(gateId, artifact, evidenceRoot) {
  if (!artifact || typeof artifact !== 'object') return [`${gateId}: artifact entry is invalid`];
  if (Object.hasOwn(artifact, 'path')) {
    return [`${gateId}: artifact path is not accepted; name the evidence file with file`];
  }
  const unknown = Object.keys(artifact).filter(field => !artifactFields.has(field));
  if (unknown.length > 0)
    return unknown.map(field => `${gateId}: artifact ${field} is not accepted`);
  const file = typeof artifact.file === 'string' ? artifact.file : '';
  const digest = typeof artifact.sha256 === 'string' ? artifact.sha256.toLowerCase() : '';
  const errors = [];
  if (!FILE_NAME_PATTERN.test(file))
    errors.push(`${gateId}: artifact file must be a plain file name`);
  if (!SHA256_PATTERN.test(digest)) {
    errors.push(`${gateId}: artifact ${file || '<unknown>'} sha256 must be 64 hex characters`);
  }
  if (errors.length > 0 || !evidenceRoot) return errors;
  // The name has no separators and the root is canonical; a link could still read elsewhere.
  const absolute = path.join(evidenceRoot, file);
  let entry;
  try {
    entry = fs.lstatSync(absolute);
  } catch {
    return [`${gateId}: evidence file not found: ${file}`];
  }
  if (!entry.isFile()) return [`${gateId}: evidence file must be a regular file: ${file}`];
  const actual = sha256(absolute);
  if (actual !== digest) {
    errors.push(`${gateId}: sha256 mismatch for ${file} expected=${digest} actual=${actual}`);
  }
  return errors;
}

function gateLabel(gate) {
  return typeof gate?.id === 'string' && GATE_ID_PATTERN.test(gate.id) ? gate.id : '<unknown>';
}

function validateGate(gate, evidenceRoot) {
  const shapeErrors = validateGateShape(gate);
  if (shapeErrors.length > 0) return shapeErrors.map(error => `${gateLabel(gate)}: ${error}`);
  const errors = [];
  if (!passingStatuses.has(gate.status)) {
    errors.push(`${gate.id}: status=${gate.status} is not one of ${passingStatusList}`);
  }
  errors.push(...validateSignoff(gate));
  for (const artifact of gate.required_artifacts) {
    errors.push(...validateArtifact(gate.id, artifact, evidenceRoot));
  }
  return errors;
}

let manifest;
let evidenceRoot;
try {
  const options = readOptions(process.argv.slice(2));
  manifest = readManifest(manifestFile);
  evidenceRoot = readEvidenceRoot(options['evidence-root'] ?? null);
} catch (error) {
  console.error(`[release-evidence] FAIL ${error.message}`);
  process.exit(2);
}

const gates = Array.isArray(manifest?.gates) ? manifest.gates : [];
const manifestErrors = isRecord(manifest)
  ? Object.keys(manifest)
      .filter(field => !manifestFields.has(field))
      .map(field => `manifest: ${field} is not accepted`)
  : ['manifest: must be a mapping with gates'];
const expectedIds = Array.from(
  { length: 10 },
  (_, index) => `G${String(index + 1).padStart(2, '0')}`
);
const listedIds = gates.map(gate => gate?.id);
const seenIds = new Set(listedIds);
const errors = [
  ...manifestErrors,
  ...expectedIds.filter(id => !seenIds.has(id)).map(id => `${id}: missing from manifest`),
  ...expectedIds
    .filter(id => listedIds.indexOf(id) !== listedIds.lastIndexOf(id))
    .map(id => `${id}: listed more than once`),
];

for (const gate of gates) errors.push(...validateGate(gate, evidenceRoot));

if (errors.length > 0) {
  console.error('[release-evidence] FAIL production evidence is incomplete:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

const files = evidenceRoot ? 'verified' : 'not-verified (manifest only)';
console.log(`[release-evidence] PASS gates=${gates.length} files=${files}`);
