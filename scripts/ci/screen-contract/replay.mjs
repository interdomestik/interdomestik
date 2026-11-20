// The R-10 trial replay (WP-05 design §7; code review r1, B2). A replay judges one merged PR's
// base and head by the production path of the CLI. Only a pair that predates adoption (neither
// side has the baseline) gets synthesized inputs: the base scan becomes a baseline (takenAt
// "replay:<sha>") that WP-02's unchanged parser must accept and that the head is judged against,
// and a missing registry or rebuilt list is written as empty. Every synthesized input is recorded.
// For such a pair the floor is completeness; every unit decrease is recorded for adjudication.
import { CHECKS } from './evaluate.mjs';
import { lintTree, linted } from './lint.mjs';
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

export function synthesizedBaseline(baseSha, baseLint) {
  const checks = {};
  for (const { id, multiset } of CHECKS) {
    const items = baseLint[id].items.map(item => item.id);
    checks[id] = {
      mode: 'report',
      unit: 'replay',
      predicate: 'replay',
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
  return { synthesized, lint, baseline: synthesizedBaseline(baseSha, lint) };
}

const unitsOf = lintOrResults =>
  Object.fromEntries(Object.entries(lintOrResults).map(([id, r]) => [id, r.units ?? {}]));

// The adjudication lines of a pre-adoption pair: inventory and every unit-kind decrease.
export function adjudication(baseLint, results) {
  const lines = [];
  for (const result of results) {
    const before = baseLint[result.id];
    if (!before) continue;
    if (result.files < before.files)
      lines.push(`${result.id}: inventory decrease ${before.files} -> ${result.files}`);
    for (const [kind, n] of Object.entries(before.units)) {
      const now = result.units?.[kind] > 0 ? result.units[kind] : 0;
      if (now >= n) continue;
      lines.push(`${result.id}: unit decrease ${kind} ${n} -> ${now}`);
      if (n > 0 && now === 0) lines.push(`${result.id}: kind empty ${kind} (${n} -> 0)`);
    }
  }
  return lines;
}

// The replay summary of a judged pair.
export function replaySummary({ takenAt, synthesized, baseLint, results, versions }) {
  return {
    takenAt,
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
