// The R-10 trial replay (WP-05 design §7): the full base and head trees of one merged PR, each
// linted by this scanner, with the inputs a pre-adoption tree lacks synthesized and recorded. The
// base scan becomes a synthesized baseline (takenAt "replay:<sha>") that WP-02's unchanged parser
// must accept; the head is judged against it. The floor is completeness only: every expected file
// reconciled. An inventory decrease and an emptied unit kind are recorded for adjudication.
import fs from 'node:fs';
import path from 'node:path';

import { coverageShortfall, parseBaseline, ratchet } from '../server-mutation/baseline.mjs';
import { extractRevision } from '../server-mutation/git.mjs';
import { BASELINE_PATH, CHECKS, evaluatorDigest } from './evaluate.mjs';
import { SCANNER_ROOT, lintTree, linted } from './lint.mjs';
import { REGISTRY_PATH } from './registry.mjs';
import { REBUILT_PATH } from './transfer.mjs';

const SYNTHESIZED = Object.freeze({
  [REGISTRY_PATH]: `${JSON.stringify({ version: 1, entries: [] })}\n`,
  [REBUILT_PATH]: '[]\n',
});

// Writes each missing input into an extracted tree and returns what was synthesized.
function synthesizeInputs(root) {
  const out = [];
  for (const [rel, text] of Object.entries(SYNTHESIZED)) {
    const abs = path.join(root, rel);
    if (fs.existsSync(abs)) continue;
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, text);
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

function productionFloor(id) {
  const file = path.join(SCANNER_ROOT, BASELINE_PATH);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8')).checks?.[id]?.coverageMin ?? null;
}

export async function replay(repo, baseSha, headSha) {
  const baseRoot = extractRevision(repo, baseSha);
  const headRoot = extractRevision(repo, headSha);
  try {
    const provenance = { base: synthesizeInputs(baseRoot), head: synthesizeInputs(headRoot) };
    const baseLint = await lintTree(baseRoot, linted(baseRoot));
    const headLint = await lintTree(headRoot, linted(headRoot));
    const synthesized = synthesizedBaseline(baseSha, baseLint);
    const baseline = parseBaseline(JSON.stringify(synthesized), 'replay', CHECKS);
    const shas = { base: baseSha, head: headSha };
    const adjudicate = [];
    const results = CHECKS.map(({ id, multiset }) => {
      const scan = headLint[id];
      const current = scan.items.map(item => item.id);
      const plain = multiset ? current : [...new Set(current)];
      const { new: added, fixed } = ratchet(plain, baseline.checks[id].items);
      if (scan.files < baseLint[id].files)
        adjudicate.push(`${id}: inventory decrease ${baseLint[id].files} -> ${scan.files}`);
      for (const [kind, n] of Object.entries(baseLint[id].units))
        if (n > 0 && !(scan.units[kind] > 0)) {
          const floor = productionFloor(id);
          const shortfall = floor === null ? [] : coverageShortfall(scan.units, floor);
          adjudicate.push(
            `${id}: kind empty ${kind} (${n} -> 0)${shortfall.length ? `; production shortfall ${shortfall.join(', ')}` : ''}`
          );
        }
      return {
        id,
        ...shas,
        digest: evaluatorDigest(baseline.checks[id]),
        enforcing: false,
        units: scan.units,
        files: scan.files,
        total: plain.length,
        new: added,
        fixed,
        tamper: [],
        findings: scan.items,
      };
    });
    return {
      results,
      summary: {
        takenAt: synthesized.takenAt,
        synthesized: provenance,
        adjudicate,
        complete: true,
      },
    };
  } finally {
    fs.rmSync(baseRoot, { recursive: true, force: true });
    fs.rmSync(headRoot, { recursive: true, force: true });
  }
}
