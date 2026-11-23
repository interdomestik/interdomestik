// The candidate judgment of an R-10 replay pair (the WP-05 flip, §4; r2-B8, r3-B6). Each pair is
// judged as PR-B's required workflow would judge it: every check with the candidate scanner's own
// settings in `mode: "fail"`, the admitted inventory taken from the candidate's scan of the parent
// (never from the head's baseline), passed through production's rebuilt-list admission with the
// head's list, and each tree held to its own revision's coverage floor. The historical judgment of
// the pair is kept beside it as context.
import { ScanError } from '../server-mutation/ast.mjs';
import { coverageShortfall } from '../server-mutation/baseline.mjs';
import { CHECKS, evaluateCheck, evaluatorDigest } from './evaluate.mjs';
import { frozenEntries } from './registry.mjs';
import { applyRebuilt } from './transfer.mjs';

// A revision's floor for one check: its real baseline's `coverageMin`, or completeness (0: no
// per-kind minimum; the lint already refuses a missing or ignored file) for a revision without one.
const floorOf = (real, id) => {
  const floor = real?.checks?.[id]?.coverageMin;
  return floor === undefined ? { source: 'completeness', value: 0 } : { source: 'real', value: floor };
};

const failSettings = (candidate, id) => ({ ...candidate.checks[id], mode: 'fail' });

// The items the candidate admits for one check: the parent scan's (lint items and findings from
// outside the lint), less every item whose file the head declares rebuilt (production's
// `applyRebuilt`, r3-B6).
function admittedOf(check, baseScan, baseExtra, rebuilt) {
  const ids = [...baseScan.items, ...baseExtra].map(item => item.id);
  const plain = check.multiset ? ids : [...new Set(ids)];
  return applyRebuilt(check.id, plain, rebuilt).admitted;
}

// One check of one pair. A shortfall against a real floor, on either tree, is a scanner error of
// that judgment, recorded (the pair still completes, and the error disqualifies the check).
function judgeCheck(check, ctx) {
  const { id } = check;
  const floors = { base: floorOf(ctx.baseReal, id), head: floorOf(ctx.headReal, id) };
  const out = {
    id,
    floors,
    digest: { candidate: evaluatorDigest(failSettings(ctx.candidate, id)), effective: null },
    new: [],
    fixed: [],
    tamper: [],
    errors: [],
  };
  if (ctx.baseLint[id].files === 0) out.errors.push(`${id}: no expected file on the base`);
  const baseShort = coverageShortfall(ctx.baseLint[id].units, floors.base.value);
  if (floors.base.source === 'real' && baseShort.length)
    out.errors.push(`${id}: base coverage below its floor (${baseShort.join(', ')})`);
  const items = admittedOf(check, ctx.baseLint[id], ctx.baseExtra[id] ?? [], ctx.rebuilt);
  const settings = {
    ...failSettings(ctx.candidate, id),
    coverageMin: floors.head.value,
    items,
    ...(items.length ? {} : { exhausted: true }),
  };
  const baseline = { version: 1, takenAt: 'candidate', checks: { [id]: settings }, exceptions: [] };
  const tamper = [...(ctx.tamper[id] ?? [])];
  if (id === 'CHK-22') tamper.push(...frozenEntries(ctx.headRegistry));
  try {
    const result = evaluateCheck(check, ctx.headLint[id], {
      base: baseline,
      head: baseline,
      pairedHead: baseline,
      shas: ctx.shas,
      rebuilt: [],
      extra: { findings: ctx.headExtra[id] ?? [], tamper: [...new Set(tamper)] },
    });
    Object.assign(out, {
      new: result.new,
      fixed: result.fixed,
      tamper: result.tamper,
      digest: { ...out.digest, effective: result.digest },
    });
  } catch (error) {
    if (!(error instanceof ScanError)) throw error;
    out.errors.push(error.message);
  }
  return out;
}

// The candidate judgment of a pair. `tamper` is the production judgment of the pair's actual input
// changes (the historical results' tamper, per check); D-7's freeze is added for CHK-22 because the
// candidate enforces it.
export function candidateJudgment(ctx) {
  const checks = CHECKS.map(check => judgeCheck(check, ctx));
  return {
    checks: Object.fromEntries(checks.map(({ id, ...rest }) => [id, rest])),
    wouldRefuse: checks
      .filter(c => c.new.length || c.fixed.length || c.tamper.length)
      .map(c => c.id),
    errors: checks.flatMap(c => c.errors),
  };
}
