// Tenant guard pass 2: legacy operation dependencies, then sink and tenant-state propagation.

import ts from 'typescript';
import { LEGACY } from './manifest.mjs';
import { originKey } from './modules.mjs';
import { isFunctionLike, unitName, unitOf } from './syntax.mjs';

/** Checks accepted legacy operations and propagates sinks and tenant state to a fixpoint. */
export function propagate(ctx) {
  const {
    accepted,
    collectTenantState,
    connectionControlUnits,
    dependenciesUnchanged,
    expressionDependencies,
    factsOf,
    isTest,
    legacyDigest,
    legacyOps,
    legacySinks,
    markSink,
    originsOf,
    pinnedModules,
    seedPinnedState,
    sinkArguments,
    sources,
    stateUseProblem,
    telemetry,
    tenantExpressionOf,
    tenantState,
    transferProblem,
    violate,
  } = ctx;

  // ---- pass 2: dependencies of accepted legacy operations, and legacy tenant sinks ----------
  for (const key of LEGACY.keys())
    if (sources.has(key.slice(0, key.lastIndexOf('#')))) legacyDigest(key);
  if (legacyOps.length > 0) seedPinnedState();
  for (const op of legacyOps) {
    const { fact, unit, node, form, key } = op;
    const roots = tenantExpressionOf(node, form);
    const { params, external } = expressionDependencies(fact, unit, roots);
    const dependencies = dependenciesUnchanged(fact, external);
    if (!dependencies.ok) {
      violate(
        fact.file,
        node,
        fact.sourceFile,
        'C1',
        `${key} depends on changed code (${dependencies.witness})`
      );
      continue;
    }
    if (form === 'call') {
      const call = node.parent;
      const problem = call.arguments
        .slice(1)
        .map(argument => transferProblem(fact, unit, argument))
        .find(Boolean);
      if (problem) {
        violate(
          fact.file,
          node,
          fact.sourceFile,
          'C1',
          `${key} hands its transaction to ${problem}`
        );
        continue;
      }
      collectTenantState(fact, external);
    }
    telemetry.legacyAccepted += 1;
    accepted.push({ file: fact.file, unit: unitName(unit, fact.sourceFile), key });
    if (params.size > 0) markSink(fact, unit, params);
  }

  // A contracted unit that pins tenant GUCs takes its tenant from its parameters: its callers are
  // held to the same edge rule as any legacy sink.
  for (const { fact, unit } of connectionControlUnits) {
    const params = new Set();
    if (isFunctionLike(unit)) {
      for (const parameter of unit.parameters)
        if (ts.isIdentifier(parameter.name)) params.add(parameter.name.text);
    }
    if (params.size > 0) markSink(fact, unit, params);
  }

  // Callers of sinks: a changed caller may not hand a tenant to an unchanged legacy function; an
  // unchanged caller that forwards its own parameters becomes a sink itself. Tenant state and its
  // writers (A5-r2) can add sinks, so the two analyses run to a common fixpoint.
  const reportedEdges = new Set();
  const reportedState = new Set();
  const analysisSize = () =>
    tenantState.size +
    [...legacySinks.values()].reduce((total, sink) => total + 1 + sink.params.size, 0);
  for (let round = 0; ; round += 1) {
    let grew = true;
    while (grew) {
      grew = false;
      for (const file of [...sources.keys()].sort()) {
        if (isTest(file) || /\.d\.[cm]?ts$/u.test(file)) continue;
        const fact = factsOf(file);
        if (!fact) continue;
        for (const reference of fact.references) {
          if (!reference.binding) continue;
          const { origins, form } = originsOf(fact, reference);
          for (const origin of origins) {
            const key = originKey(origin);
            const sink = key && legacySinks.get(key);
            if (!sink) continue;
            const caller = unitOf(reference.node);
            if (sink.file === file && caller === sink.unit) continue;
            const edge = `${file}:${reference.node.pos}->${key}`;
            if (form === 'export') continue;
            if (form !== 'call' && form !== 'jsx') {
              if (!reportedEdges.has(edge)) {
                reportedEdges.add(edge);
                violate(
                  file,
                  reference.node,
                  fact.sourceFile,
                  'C1',
                  `legacy tenant sink ${key} used as ${form}`
                );
              }
              continue;
            }
            // A state writer (A5-r2) admits a changed caller whose arguments are fixed: built
            // without the caller's parameters and from unchanged code only.
            if (!fact.unchanged(caller) && sink.writer) {
              const fixed = expressionDependencies(
                fact,
                caller,
                sinkArguments(sink, reference.node)
              );
              const dependencies = dependenciesUnchanged(fact, fixed.external);
              if ((fixed.params.size > 0 || !dependencies.ok) && !reportedEdges.has(edge)) {
                reportedEdges.add(edge);
                violate(
                  file,
                  reference.node,
                  fact.sourceFile,
                  'C1',
                  `changed caller hands an input to the tenant-state writer ${key}`
                );
              }
              continue;
            }
            if (!fact.unchanged(caller)) {
              if (!reportedEdges.has(edge)) {
                reportedEdges.add(edge);
                violate(
                  file,
                  reference.node,
                  fact.sourceFile,
                  'C1',
                  `changed caller hands a tenant to unchanged legacy ${key}`
                );
              }
              continue;
            }
            const { params, external } = expressionDependencies(
              fact,
              caller,
              sinkArguments(sink, reference.node)
            );
            const dependencies = dependenciesUnchanged(fact, external);
            if (!dependencies.ok) {
              if (!reportedEdges.has(edge)) {
                reportedEdges.add(edge);
                violate(
                  file,
                  reference.node,
                  fact.sourceFile,
                  'C1',
                  `call into legacy ${key} depends on changed code (${dependencies.witness})`
                );
              }
              continue;
            }
            collectTenantState(fact, external);
            if (params.size > 0 && markSink(fact, caller, params)) grew = true;
          }
        }
      }
    }

    // Every workspace reference to tenant state must be an accepted form. The text of a pinned
    // kernel module is bound by its pin and is not re-judged here.
    const before = analysisSize();
    const note = {
      writer(fact, unit, target) {
        const { params } = expressionDependencies(fact, unit, [target]);
        if (params.size > 0) markSink(fact, unit, params, true);
      },
      alias(origin, entry) {
        const key = originKey(origin);
        if (key && !tenantState.has(key)) {
          tenantState.set(key, {
            origin,
            kind: entry.kind,
            root: entry.root ?? originKey(entry.origin),
            alias: entry,
          });
        }
      },
    };
    for (const file of [...sources.keys()].sort()) {
      if (isTest(file) || /\.d\.[cm]?ts$/u.test(file) || pinnedModules.has(file)) continue;
      const fact = factsOf(file);
      if (!fact) continue;
      for (const reference of fact.references) {
        if (!reference.binding) continue;
        const { origins, form } = originsOf(fact, reference);
        for (const origin of origins) {
          const key = originKey(origin);
          if (!key || !tenantState.has(key) || form === 'export') continue;
          const entry = tenantState.get(key);
          // An alias is judged as its root: schema rules follow the declaring schema file.
          const judged = entry.alias
            ? { ...entry, origin: entry.alias.origin, root: entry.root }
            : entry;
          const problem = stateUseProblem(
            fact,
            reference.node,
            { ...judged, origin: entry.alias ? judged.origin : origin },
            note
          );
          const at = `${file}:${reference.node.pos}`;
          if (problem && !reportedState.has(at)) {
            reportedState.add(at);
            violate(
              file,
              reference.node,
              fact.sourceFile,
              'C1',
              `module state ${key} read by a retained legacy tenant ${problem}; migrate that read to withTenantAuthority`
            );
          }
        }
      }
    }
    if (analysisSize() === before) break;
  }
}
