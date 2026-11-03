// Tenant guard report: receiver sinks, unresolved legacy sinks, pins and contract use.

import { LEGACY } from './manifest.mjs';
import { byCodeUnit } from './rules-digest.mjs';

/** Reports the remaining findings and returns the guard result. */
export function report(ctx) {
  const { accepted, contractUse, legacyDigest, legacyDigests, legacySinks, receiverSinks } = ctx;
  const { sources, telemetry, tenantState, violations } = ctx;

  reportReceiverSinks(ctx);
  telemetry.receiverSinks = receiverSinks.size;
  reportUnresolvedSinks(ctx);
  telemetry.legacySinks = legacySinks.size;
  telemetry.tenantState = tenantState.size;
  if (ctx.legacyPins !== null) reportPins(ctx);
  reportContracts(ctx);
  telemetry.contractsUsed = contractUse.size;
  for (const key of LEGACY.keys())
    if (sources.has(key.slice(0, key.lastIndexOf('#')))) legacyDigest(key);
  return {
    violations,
    accepted,
    telemetry,
    sinks: [...legacySinks.keys()],
    tenantState: [...tenantState.keys()].sort(byCodeUnit),
    legacyDigests: Object.fromEntries(legacyDigests),
  };
}

// Receiver sinks found by the schema uses above, and those their callers in turn reach.
function reportReceiverSinks({ receiverQueue, receiverSinkProblems, violate }) {
  const reportedReceivers = new Set();
  while (receiverQueue.length > 0) {
    for (const { fact, node, detail } of receiverSinkProblems(receiverQueue.shift())) {
      const at = `${fact.file}:${node.pos}:${detail}`;
      if (reportedReceivers.has(at)) continue;
      reportedReceivers.add(at);
      violate(fact.file, node, fact.sourceFile, 'C1', `query receiver: ${detail}`);
    }
  }
}

function reportUnresolvedSinks({ legacySinks, violations }) {
  for (const sink of legacySinks.values()) {
    if (sink.topLevel) continue;
    const { line } = sink.unit.getSourceFile().getLineAndCharacterOfPosition(sink.unit.getStart());
    violations.push({
      rule: 'C1',
      file: sink.file,
      line: line + 1,
      unit: sink.name,
      detail: 'legacy tenant sink whose callers cannot be resolved (not a top-level declaration)',
    });
  }
}

function reportPins(ctx) {
  const { legacyClosureProblems, legacyDigest, legacyPinned, legacyPins, sources } = ctx;
  for (const key of LEGACY.keys()) {
    const file = key.slice(0, key.lastIndexOf('#'));
    if (!sources.has(file) || legacyPinned(key)) continue;
    const problems = legacyClosureProblems.get(key);
    ctx.violations.push({
      rule: 'pin',
      file,
      line: 0,
      unit: key.slice(key.lastIndexOf('#') + 1),
      detail:
        problems.length > 0
          ? `legacy kernel closure cannot be bound: ${problems.join('; ')}`
          : `legacy kernel entry differs from its reviewed contract (digest ${legacyDigest(key)}, pinned ${legacyPins.get(key) ?? 'none'})`,
    });
  }
}

// Unused or over-broad contracts are reported so the manifest cannot silently widen.
function reportContracts({ contractUse, contracts, violations }) {
  for (const contract of contracts) {
    for (const [kind, count] of Object.entries(contract.kinds)) {
      const used = contractUse.get(`${contract.file}#${contract.unit}#${kind}`) ?? 0;
      if (used === count) continue;
      violations.push({
        rule: 'contract',
        file: contract.file,
        line: 0,
        unit: contract.unit,
        detail: `${kind}: contract admits ${count}, source has ${used}`,
      });
    }
  }
}
