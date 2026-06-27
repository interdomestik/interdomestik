#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import yaml from 'js-yaml';

const rootDir = process.cwd();
const defaultManifest = 'docs/release/production-evidence.yaml';
const passingStatuses = new Set(['supplied', 'approved', 'verified']);
const requiredGateFields = ['id', 'description', 'required_artifacts', 'owner', 'status', 'signoff'];
const requiredSignoffFields = ['name', 'role', 'signed_at'];

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

function readManifest(filePath) {
  const absolute = path.resolve(rootDir, filePath);
  if (!fs.existsSync(absolute)) throw new Error(`manifest not found: ${filePath}`);
  return yaml.load(fs.readFileSync(absolute, 'utf8'));
}

function isPending(value) {
  return value == null || String(value).trim() === '' || String(value).trim().toLowerCase() === 'pending';
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
  return requiredSignoffFields
    .filter(field => isPending(gate.signoff?.[field]))
    .map(field => `${gate.id}: signoff.${field} is missing or pending`);
}

function validateArtifact(gateId, artifact) {
  const errors = [];
  if (!artifact || typeof artifact !== 'object') return [`${gateId}: artifact entry is invalid`];
  if (!artifact.path) errors.push(`${gateId}: artifact is missing path`);
  if (!artifact.sha256) errors.push(`${gateId}: artifact ${artifact.path || '<unknown>'} is missing sha256`);
  if (!artifact.path || !artifact.sha256) return errors;
  const absolute = path.resolve(rootDir, artifact.path);
  if (!fs.existsSync(absolute)) return [`${gateId}: artifact not found at ${artifact.path}`];
  const actual = sha256(absolute);
  if (actual !== String(artifact.sha256).toLowerCase()) {
    errors.push(`${gateId}: sha256 mismatch for ${artifact.path} expected=${artifact.sha256} actual=${actual}`);
  }
  return errors;
}

function validateGate(gate) {
  const shapeErrors = validateGateShape(gate);
  if (shapeErrors.length > 0) return shapeErrors.map(error => `${gate.id || '<unknown>'}: ${error}`);
  const errors = [];
  if (!passingStatuses.has(String(gate.status).toLowerCase())) {
    errors.push(`${gate.id}: status=${gate.status} is not one of supplied, approved, verified`);
  }
  errors.push(...validateSignoff(gate));
  for (const artifact of gate.required_artifacts) {
    errors.push(...validateArtifact(gate.id, artifact));
  }
  return errors;
}

const manifestPath = argValue('--manifest') || defaultManifest;
let manifest;
try {
  manifest = readManifest(manifestPath);
} catch (error) {
  console.error(`[release-evidence] FAIL ${error.message}`);
  process.exit(2);
}

const gates = Array.isArray(manifest?.gates) ? manifest.gates : [];
const expectedIds = Array.from({ length: 10 }, (_, index) => `G${String(index + 1).padStart(2, '0')}`);
const seenIds = new Set(gates.map(gate => gate.id));
const errors = expectedIds.filter(id => !seenIds.has(id)).map(id => `${id}: missing from manifest`);

for (const gate of gates) errors.push(...validateGate(gate));

if (errors.length > 0) {
  console.error('[release-evidence] FAIL production evidence is incomplete:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`[release-evidence] PASS gates=${gates.length}`);
