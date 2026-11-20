// The R-10 trial replay (WP-05 design §7; code review r1, B2). A replay judges one merged PR's
// base and head by the production path of the CLI. Only a pair that predates adoption (neither
// side has the baseline) gets synthesized inputs: the base scan becomes a baseline (takenAt
// "replay:<sha>") that WP-02's unchanged parser must accept and that the head is judged against,
// and a missing registry or rebuilt list is written as empty. Every synthesized input is recorded.
// For such a pair the floor is completeness; every unit decrease is recorded for adjudication.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { coverageShortfall } from '../server-mutation/baseline.mjs';
import { BASELINE_PATH, CHECKS } from './evaluate.mjs';
import { SCANNER_ROOT, lintTree, linted } from './lint.mjs';
import { writeInside, readInside } from './paths.mjs';
import { REGISTRY_PATH } from './registry.mjs';
import { REBUILT_PATH } from './transfer.mjs';

const SYNTHESIZED = Object.freeze({
  [REGISTRY_PATH]: `${JSON.stringify({ version: 1, entries: [] })}\n`,
  [REBUILT_PATH]: '[]\n',
});

// Writes each missing input into an extracted tree, confined to it, and returns what was written.
export function synthesizeInputs(root) {
  const out = [];
  for (const [rel, text] of Object.entries(SYNTHESIZED)) {
    if (readInside(root, rel) !== null) continue;
    writeInside(root, rel, text);
    out.push(rel);
  }
  return out;
}

// The candidate's own baseline, from the scanner's checkout: its settings label a synthesized
// baseline and its floors are what an adoption would require (r2 hardening).
export function candidateBaseline(root = SCANNER_ROOT) {
  const file = path.join(root, BASELINE_PATH);
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
}

// The commit the candidate scanner runs from, or null outside a git checkout.
export function candidateRevision(root = SCANNER_ROOT) {
  try {
    return execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

// The candidate's settings label the synthesized baseline; its floor is completeness only (§7).
export function synthesizedBaseline(baseSha, baseLint, candidate = null) {
  const checks = {};
  for (const { id, multiset } of CHECKS) {
    const items = baseLint[id].items.map(item => item.id);
    const settings = candidate?.checks?.[id];
    checks[id] = {
      mode: 'report',
      unit: settings?.unit ?? 'replay',
      predicate: settings?.predicate ?? 'replay',
      coverageMin: 0,
      items: multiset ? items : [...new Set(items)],
      exhausted: true,
    };
  }
  return { version: 1, takenAt: `replay:${baseSha}`, checks, exceptions: [] };
}

// The pre-adoption base of a replay: its inputs synthesized, its scan and the baseline from it.
export async function preAdoptionBase(baseRoot, baseSha) {
  const synthesized = synthesizeInputs(baseRoot);
  const lint = await lintTree(baseRoot, linted(baseRoot));
  return { synthesized, lint, baseline: synthesizedBaseline(baseSha, lint, candidateBaseline()) };
}

// What the candidate's adoption floors would say about each side of a pre-adoption pair: recorded
// for adjudication, never enforced (§7).
function adoptionShortfalls(candidate, baseLint, results) {
  const out = {};
  for (const result of results) {
    const floor = candidate?.checks?.[result.id]?.coverageMin;
    if (floor === undefined) continue;
    const base = baseLint?.[result.id] ? coverageShortfall(baseLint[result.id].units, floor) : [];
    const head = coverageShortfall(result.units ?? {}, floor);
    if (base.length || head.length) out[result.id] = { base, head };
  }
  return out;
}

const unitsOf = lintOrResults =>
  Object.fromEntries(Object.entries(lintOrResults).map(([id, r]) => [id, r.units ?? {}]));

// The unit-kind decreases of one check: every one, and an emptied kind on its own line.
function unitLines(id, before, after) {
  const lines = [];
  for (const [kind, n] of Object.entries(before)) {
    const now = after?.[kind] > 0 ? after[kind] : 0;
    if (now >= n) continue;
    lines.push(`${id}: unit decrease ${kind} ${n} -> ${now}`);
    if (now === 0) lines.push(`${id}: kind empty ${kind} (${n} -> 0)`);
  }
  return lines;
}

// The adjudication lines of a pre-adoption pair: inventory and every unit-kind decrease.
export function adjudication(baseLint, results) {
  const lines = [];
  for (const result of results) {
    const before = baseLint[result.id];
    if (!before) continue;
    if (result.files < before.files)
      lines.push(`${result.id}: inventory decrease ${before.files} -> ${result.files}`);
    lines.push(...unitLines(result.id, before.units, result.units));
  }
  return lines;
}

// The replay summary of a judged pair.
export function replaySummary({ takenAt, synthesized, baseLint, results, versions }) {
  const candidate = candidateBaseline();
  const settings = Object.fromEntries(
    Object.entries(candidate?.checks ?? {}).map(([id, c]) => [
      id,
      { mode: c.mode, unit: c.unit, predicate: c.predicate, coverageMin: c.coverageMin },
    ])
  );
  return {
    takenAt,
    candidate: { revision: candidateRevision(), settings },
    adoptionShortfall: baseLint ? adoptionShortfalls(candidate, baseLint, results) : {},
    synthesized,
    units: {
      base: baseLint ? unitsOf(baseLint) : null,
      head: Object.fromEntries(results.map(r => [r.id, r.units ?? {}])),
    },
    versions,
    adjudicate: baseLint ? adjudication(baseLint, results) : [],
    wouldRefuse: results
      .filter(r => r.new.length || r.fixed.length || r.tamper.length)
      .map(r => r.id),
    complete: true,
  };
}
