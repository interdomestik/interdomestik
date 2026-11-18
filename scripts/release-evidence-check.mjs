#!/usr/bin/env node
// Release evidence check. The manifest is a hash manifest: per gate it records the status, the
// signoff role and date, an opaque signer reference and the SHA-256 of each evidence file. The
// files and the signers' names are kept outside the repository; `--evidence-root <dir>` verifies
// the files in that directory against the recorded hashes.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import yaml from 'js-yaml';

const rootDir = process.cwd();
const defaultManifest = 'docs/release/production-evidence.yaml';
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
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const FILE_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/u;

function argValue(name) {
  const index = process.argv.indexOf(name);
  if (index < 0) return null;
  const value = process.argv[index + 1];
  // A flag without a value (an unset shell variable) must not silently skip what it asked for.
  if (!value || value.startsWith('--')) throw new Error(`${name} needs a value`);
  return value;
}

function readManifest(filePath) {
  const absolute = path.resolve(rootDir, filePath);
  if (!fs.existsSync(absolute)) throw new Error(`manifest not found: ${filePath}`);
  return yaml.load(fs.readFileSync(absolute, 'utf8'));
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
  const errors = [];
  for (const field of requiredGateFields) {
    if (gate[field] == null || gate[field] === '') errors.push(`missing ${field}`);
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
    .filter(field => gate.signoff?.[field] != null)
    .map(field => `${gate.id}: signoff.${field} must not be recorded here; use signer_ref`);
  for (const field of requiredSignoffFields) {
    if (isPending(gate.signoff?.[field]))
      errors.push(`${gate.id}: signoff.${field} is missing or pending`);
  }
  return errors;
}

function validateArtifact(gateId, artifact, evidenceRoot) {
  if (!artifact || typeof artifact !== 'object') return [`${gateId}: artifact entry is invalid`];
  if (artifact.path != null) {
    return [`${gateId}: artifact path is not accepted; name the evidence file with file`];
  }
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

function validateGate(gate, evidenceRoot) {
  const shapeErrors = validateGateShape(gate);
  if (shapeErrors.length > 0)
    return shapeErrors.map(error => `${gate.id || '<unknown>'}: ${error}`);
  const errors = [];
  if (!passingStatuses.has(String(gate.status).toLowerCase())) {
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
  manifest = readManifest(argValue('--manifest') ?? defaultManifest);
  evidenceRoot = readEvidenceRoot(argValue('--evidence-root'));
} catch (error) {
  console.error(`[release-evidence] FAIL ${error.message}`);
  process.exit(2);
}

const gates = Array.isArray(manifest?.gates) ? manifest.gates : [];
const expectedIds = Array.from(
  { length: 10 },
  (_, index) => `G${String(index + 1).padStart(2, '0')}`
);
const seenIds = new Set(gates.map(gate => gate.id));
const errors = expectedIds.filter(id => !seenIds.has(id)).map(id => `${id}: missing from manifest`);

for (const gate of gates) errors.push(...validateGate(gate, evidenceRoot));

if (errors.length > 0) {
  console.error('[release-evidence] FAIL production evidence is incomplete:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

const files = evidenceRoot ? 'verified' : 'not-verified (no --evidence-root)';
console.log(`[release-evidence] PASS gates=${gates.length} files=${files}`);
