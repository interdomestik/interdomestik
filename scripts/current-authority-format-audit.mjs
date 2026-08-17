#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { extractSection, parseTrackerDocument } from './plan-model.mjs';

const PROGRAM = 'docs/plans/current-program.md';
const TRACKER = 'docs/plans/current-tracker.md';
const MANIFEST = 'docs/plans/history/current-authority/2026-08-16-through-rev-243.manifest.json';
const MARKER = /The next active governed implementation goal[^\n]+/g;
const SHA256 = /^[a-f0-9]{64}$/;
const GIT_SHA = /^[a-f0-9]{40}$/;

function rootArg(args) {
  if (args.length === 0) return process.cwd();
  if (args.length === 2 && args[0] === '--root') return resolve(args[1]);
  throw new Error('usage: current-authority-format-audit.mjs [--root <path>]');
}

function sha(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function lineCount(text) {
  return text === '' ? 0 : text.split(/\r?\n/).length - (text.endsWith('\n') ? 1 : 0);
}

function tableRows(section) {
  const lines = section.split(/\r?\n/).filter(line => line.trim().startsWith('|'));
  return Math.max(0, lines.length - 2);
}

function git(root, args, binary = false) {
  const result = spawnSync('git', args, {
    cwd: root,
    encoding: binary ? null : 'utf8',
    maxBuffer: 4 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${String(result.stderr).trim()}`);
  }
  return binary ? result.stdout : result.stdout.trim();
}

function inspectLiveDocument(path, bytes, byteCeiling, lineCeiling, errors) {
  const text = bytes.toString('utf8');
  if (bytes.length > byteCeiling) errors.push(`${path}: exceeds ${byteCeiling} bytes`);
  if (lineCount(text) > lineCeiling) errors.push(`${path}: exceeds ${lineCeiling} lines`);
  const markers = text.match(MARKER) ?? [];
  if (markers.length !== 1) errors.push(`${path}: expected exactly one active-goal marker`);
  const revisions = text.match(/^(?:##\s+)?Rev\s+\d+\b/gm) ?? [];
  if (revisions.length > 1) errors.push(`${path}: contains multiple revision narratives`);
  if (/```(?:log|console|text)\s*[\s\S]*?```/i.test(text)) {
    errors.push(`${path}: contains a raw workflow/runtime transcript block`);
  }
  return { text, marker: markers[0] };
}

function validateManifest(root, manifest, errors) {
  if (manifest.schemaVersion !== 1) errors.push(`${MANIFEST}: schemaVersion must be 1`);
  if (manifest.repository !== 'interdomestik/interdomestik') {
    errors.push(`${MANIFEST}: repository identity mismatch`);
  }
  if (!GIT_SHA.test(manifest.sourceCommit ?? '')) {
    errors.push(`${MANIFEST}: invalid source commit`);
    return;
  }
  if (
    manifest.throughRevision !== 243 ||
    manifest.terminalState?.lifecycle !== 'blocked_requires_current_authority' ||
    manifest.terminalState?.activeSlice !== null
  ) {
    errors.push(`${MANIFEST}: terminal authority mismatch`);
  }
  const expectedPaths = new Set([PROGRAM, TRACKER]);
  if (!Array.isArray(manifest.artifacts) || manifest.artifacts.length !== 2) {
    errors.push(`${MANIFEST}: expected exactly two historical artifacts`);
    return;
  }
  for (const artifact of manifest.artifacts) {
    if (!expectedPaths.delete(artifact.path)) {
      errors.push(`${MANIFEST}: unexpected or duplicate artifact ${String(artifact.path)}`);
      continue;
    }
    const spec = `${manifest.sourceCommit}:${artifact.path}`;
    const historical = git(root, ['show', spec], true);
    const oid = git(root, ['rev-parse', spec]);
    if (artifact.bytes !== historical.length) errors.push(`${artifact.path}: byte mismatch`);
    if (artifact.lineCount !== lineCount(historical.toString('utf8'))) {
      errors.push(`${artifact.path}: line-count mismatch`);
    }
    if (!SHA256.test(artifact.sha256 ?? '') || artifact.sha256 !== sha(historical)) {
      errors.push(`${artifact.path}: SHA-256 mismatch`);
    }
    if (artifact.gitBlobOid !== oid) errors.push(`${artifact.path}: Git blob mismatch`);
    const immutable = `https://github.com/interdomestik/interdomestik/blob/${manifest.sourceCommit}/${artifact.path}`;
    if (artifact.immutableUrl !== immutable)
      errors.push(`${artifact.path}: immutable URL mismatch`);
    if (artifact.recoveryCommand !== `git show ${spec}`) {
      errors.push(`${artifact.path}: recovery command mismatch`);
    }
  }
  if (expectedPaths.size > 0) errors.push(`${MANIFEST}: historical artifact missing`);
}

function main() {
  const root = rootArg(process.argv.slice(2));
  const errors = [];
  const programBytes = readFileSync(resolve(root, PROGRAM));
  const trackerBytes = readFileSync(resolve(root, TRACKER));
  const manifestBytes = readFileSync(resolve(root, MANIFEST));
  const program = inspectLiveDocument(PROGRAM, programBytes, 16_384, 220, errors);
  const tracker = inspectLiveDocument(TRACKER, trackerBytes, 12_288, 160, errors);
  if (tableRows(extractSection(program.text, 'Ordered Candidate Priorities')) > 12) {
    errors.push(`${PROGRAM}: more than 12 candidate rows`);
  }
  const rows = parseTrackerDocument(tracker.text);
  if (rows.queueRows.length !== 1 || rows.proofRows.length !== 1) {
    errors.push(`${TRACKER}: expected one queue row and one proof row`);
  } else if (rows.queueRows[0].id !== rows.proofRows[0].id) {
    errors.push(`${TRACKER}: queue and proof IDs differ`);
  }
  if (program.marker !== tracker.marker) errors.push('program/tracker resolver markers disagree');
  const manifestDigest = sha(manifestBytes);
  if (!program.text.includes(manifestDigest) || !tracker.text.includes(manifestDigest)) {
    errors.push('live authority documents do not bind the exact manifest SHA-256');
  }
  validateManifest(root, JSON.parse(manifestBytes.toString('utf8')), errors);
  if (errors.length > 0) {
    console.error('current-authority format audit failed');
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
  }
  console.log('current-authority format audit passed');
  console.log(JSON.stringify({ manifestSha256: manifestDigest, queueId: rows.queueRows[0].id }));
}

try {
  main();
} catch (error) {
  console.error(`current-authority format audit failed: ${error.message}`);
  process.exit(1);
}
