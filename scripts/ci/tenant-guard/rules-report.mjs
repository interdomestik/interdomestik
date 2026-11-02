// Tenant guard report: receiver sinks, unresolved legacy sinks, pins and contract use.

import { LEGACY } from './manifest.mjs';

/** Reports the remaining findings and returns the guard result. */
export function report(ctx) {
  const {
    accepted,
    contractUse,
    contracts,
    legacyClosureProblems,
    legacyDigest,
    legacyDigests,
    legacyPinned,
    legacyPins,
    legacySinks,
    receiverQueue,
    receiverSinkProblems,
    receiverSinks,
    sources,
    telemetry,
    tenantState,
    violate,
    violations,
  } = ctx;

  // Receiver sinks found by the schema uses above, and those their callers in turn reach.
  const reportedReceivers = new Set();
  while (receiverQueue.length > 0) {
    for (const { fact, node, detail } of receiverSinkProblems(receiverQueue.shift())) {
      const at = `${fact.file}:${node.pos}:${detail}`;
      if (reportedReceivers.has(at)) continue;
      reportedReceivers.add(at);
      violate(fact.file, node, fact.sourceFile, 'C1', `query receiver: ${detail}`);
    }
  }
  telemetry.receiverSinks = receiverSinks.size;
  for (const sink of legacySinks.values()) {
    if (!sink.topLevel) {
      const { line } = sink.unit
        .getSourceFile()
        .getLineAndCharacterOfPosition(sink.unit.getStart());
      violations.push({
        rule: 'C1',
        file: sink.file,
        line: line + 1,
        unit: sink.name,
        detail: 'legacy tenant sink whose callers cannot be resolved (not a top-level declaration)',
      });
    }
  }
  telemetry.legacySinks = legacySinks.size;
  telemetry.tenantState = tenantState.size;

  if (legacyPins !== null) {
    for (const key of LEGACY.keys()) {
      const file = key.slice(0, key.lastIndexOf('#'));
      if (!sources.has(file) || legacyPinned(key)) continue;
      const problems = legacyClosureProblems.get(key);
      violations.push({
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
  for (const contract of contracts) {
    for (const [kind, count] of Object.entries(contract.kinds)) {
      const used = contractUse.get(`${contract.file}#${contract.unit}#${kind}`) ?? 0;
      if (used !== count) {
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
  telemetry.contractsUsed = contractUse.size;
  for (const key of LEGACY.keys())
    if (sources.has(key.slice(0, key.lastIndexOf('#')))) legacyDigest(key);
  return {
    violations,
    accepted,
    telemetry,
    sinks: [...legacySinks.keys()],
    tenantState: [...tenantState.keys()].sort(),
    legacyDigests: Object.fromEntries(legacyDigests),
  };
}
