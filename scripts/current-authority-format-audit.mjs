#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { extractSection, parseTrackerDocument } from './plan-model.mjs';
const PROGRAM = 'docs/plans/current-program.md';
const TRACKER = 'docs/plans/current-tracker.md';
const MANIFEST = 'docs/plans/history/current-authority/2026-08-16-through-rev-243.manifest.json';
const SOURCE_COMMIT = '523fda2493ca728dea48241aad5769917f1ad03f';
const MARKER = /The next active governed implementation goal[^\n]+/g;
const SHA256 = /^[a-f0-9]{64}$/,
  GIT_SHA = /^[a-f0-9]{40}$/;
const ORIGIN = /^(https:\/\/github\.com\/|git@github\.com:)interdomestik\/interdomestik(\.git)?$/;
const GIT = '/usr/bin/git';
// prettier-ignore
const PROGRAM_SECTIONS = ['Current Phase', 'M0-M5 Implementation Blueprint', 'Ordered Candidate Priorities', 'Selection Constraints', 'Historical Authority'];
const TRACKER_SECTIONS = ['Active Queue', 'Proof Ledger', 'Next Selection', 'Historical Authority'];
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const lineCount = text => (text ? text.split(/\r?\n/).length - Number(text.endsWith('\n')) : 0);
const tableRows = text =>
  Math.max(0, text.split(/\r?\n/).filter(line => line.trimStart().startsWith('|')).length - 2);
function requireSections(text, path, headings, errors) {
  for (const heading of headings) {
    if (!extractSection(text, heading).trim()) errors.push(`${path}: missing ${heading} section`);
  }
}
function git(args, binary = false) {
  const result = spawnSync(GIT, args, {
    encoding: binary ? null : 'utf8',
    maxBuffer: 4 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${String(result.stderr).trim()}`);
  }
  return binary ? result.stdout : result.stdout.trim();
}
function hasCanonicalOrigin() {
  const result = spawnSync(GIT, ['remote', 'get-url', 'origin'], { encoding: 'utf8' });
  return result.status === 0 && ORIGIN.test(result.stdout.trim());
}
function ensureCommit(commit) {
  const present = spawnSync(GIT, ['cat-file', '-e', `${commit}^{commit}`]);
  if (present.status === 0) return;
  const origin = git(['remote', 'get-url', 'origin']);
  if (!ORIGIN.test(origin)) {
    throw new Error('historical commit is missing and origin is not canonical');
  }
  const fetched = spawnSync(GIT, ['fetch', '--no-tags', '--depth=1', 'origin', commit], {
    encoding: 'utf8',
  });
  if (fetched.status) throw new Error(`exact historical fetch failed: ${fetched.stderr.trim()}`);
}
function inspectLiveDocument(path, bytes, byteCeiling, lineCeiling, errors) {
  const text = bytes.toString('utf8');
  if (bytes.length > byteCeiling) errors.push(`${path}: exceeds ${byteCeiling} bytes`);
  if (lineCount(text) > lineCeiling) errors.push(`${path}: exceeds ${lineCeiling} lines`);
  const markers = text.match(MARKER) ?? [];
  if (markers.length !== 1) errors.push(`${path}: expected exactly one active-goal marker`);
  const revisions = text.match(/^(?:##\s+)?Rev\s+\d+\b/gm) ?? [];
  if (revisions.length > 1) errors.push(`${path}: contains multiple revision narratives`);
  if (/^```(?:log|console|text)\s*$/im.test(text)) {
    errors.push(`${path}: contains a raw workflow/runtime transcript block`);
  }
  return { text, marker: markers[0] };
}
function validateArtifact(commit, path, artifact, errors) {
  const spec = `${commit}:${path}`;
  const historical = git(['show', spec], true);
  const immutable = `https://github.com/interdomestik/interdomestik/blob/${commit}/${path}`;
  const checks = [
    [artifact.bytes === historical.length, 'byte mismatch'],
    [artifact.lineCount === lineCount(historical.toString('utf8')), 'line-count mismatch'],
    [SHA256.test(artifact.sha256 ?? '') && artifact.sha256 === sha(historical), 'SHA-256 mismatch'],
    [artifact.gitBlobOid === git(['rev-parse', spec]), 'Git blob mismatch'],
    [artifact.immutableUrl === immutable, 'immutable URL mismatch'],
    [artifact.recoveryCommand === `git show ${spec}`, 'recovery command mismatch'],
  ];
  for (const [passes, message] of checks) {
    if (!passes) errors.push(`${path}: ${message}`);
  }
}
function validateManifest(manifest, errors) {
  if (manifest.schemaVersion !== 1) errors.push(`${MANIFEST}: schemaVersion must be 1`);
  if (manifest.repository !== 'interdomestik/interdomestik')
    errors.push(`${MANIFEST}: repository identity mismatch`);
  if (!GIT_SHA.test(manifest.sourceCommit ?? '')) {
    errors.push(`${MANIFEST}: invalid source commit`);
    return;
  }
  if (hasCanonicalOrigin() && manifest.sourceCommit !== SOURCE_COMMIT) {
    errors.push(`${MANIFEST}: source commit must match approved pre-compaction main`);
    return;
  }
  if (
    manifest.throughRevision !== 243 ||
    manifest.terminalState?.lifecycle !== 'blocked_requires_current_authority' ||
    manifest.terminalState?.activeSlice !== null
  ) {
    errors.push(`${MANIFEST}: terminal authority mismatch`);
  }
  ensureCommit(manifest.sourceCommit);
  if (!Array.isArray(manifest.artifacts) || manifest.artifacts.length !== 2) {
    errors.push(`${MANIFEST}: expected exactly two historical artifacts`);
    return;
  }
  for (const path of [PROGRAM, TRACKER]) {
    const matches = manifest.artifacts.filter(artifact => artifact.path === path);
    if (matches.length !== 1) errors.push(`${MANIFEST}: expected one artifact for ${path}`);
    else validateArtifact(manifest.sourceCommit, path, matches[0], errors);
  }
}
function main() {
  const errors = [];
  const programBytes = readFileSync(PROGRAM);
  const trackerBytes = readFileSync(TRACKER);
  const manifestBytes = readFileSync(MANIFEST);
  const program = inspectLiveDocument(PROGRAM, programBytes, 16_384, 220, errors);
  const tracker = inspectLiveDocument(TRACKER, trackerBytes, 12_288, 160, errors);
  requireSections(program.text, PROGRAM, PROGRAM_SECTIONS, errors);
  requireSections(tracker.text, TRACKER, TRACKER_SECTIONS, errors);
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
  validateManifest(JSON.parse(manifestBytes.toString('utf8')), errors);
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
