// Tenant guard pass 2: legacy operation dependencies, then sink and tenant-state propagation.

import ts from 'typescript';
import { LEGACY } from './manifest.mjs';
import { originKey } from './modules.mjs';
import { forEachOrigin } from './rules-origins.mjs';
import { isFunctionLike, unitName, unitOf } from './syntax.mjs';

/** Checks accepted legacy operations and propagates sinks and tenant state to a fixpoint. */
export function propagate(ctx) {
  checkLegacyOperations(ctx);
  markConnectionControlSinks(ctx);

  // Callers of sinks: a changed caller may not hand a tenant to an unchanged legacy function; an
  // unchanged caller that forwards its own parameters becomes a sink itself. Tenant state and its
  // writers (A5-r2) can add sinks, so the two analyses run to a common fixpoint.
  const reportedEdges = new Set();
  const reportedState = new Set();
  let before;
  do {
    let grew;
    do {
      grew = propagateSinkEdges(ctx, reportedEdges);
    } while (grew);

    // Every workspace reference to tenant state must be an accepted form. The text of a pinned
    // kernel module is bound by its pin and is not re-judged here.
    before = analysisSize(ctx);
    checkTenantStateUses(ctx, reportedState);
  } while (analysisSize(ctx) !== before);
}

// ---- pass 2: dependencies of accepted legacy operations, and legacy tenant sinks ------------
function checkLegacyOperations(ctx) {
  const { legacyDigest, legacyOps, seedPinnedState, sources } = ctx;
  for (const key of LEGACY.keys())
    if (sources.has(key.slice(0, key.lastIndexOf('#')))) legacyDigest(key);
  if (legacyOps.length > 0) seedPinnedState();
  for (const op of legacyOps) checkLegacyOperation(ctx, op);
}

function checkLegacyOperation(ctx, { fact, unit, node, form, key }) {
  const { dependenciesUnchanged, expressionDependencies, tenantExpressionOf, violate } = ctx;
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
    return;
  }
  if (form === 'call') {
    const problem = node.parent.arguments
      .slice(1)
      .map(argument => ctx.transferProblem(fact, unit, argument))
      .find(Boolean);
    if (problem) {
      violate(fact.file, node, fact.sourceFile, 'C1', `${key} hands its transaction to ${problem}`);
      return;
    }
    ctx.collectTenantState(fact, external);
  }
  ctx.telemetry.legacyAccepted += 1;
  ctx.accepted.push({ file: fact.file, unit: unitName(unit, fact.sourceFile), key });
  if (params.size > 0) ctx.markSink(fact, unit, params);
}

// A contracted unit that pins tenant GUCs takes its tenant from its parameters: its callers are
// held to the same edge rule as any legacy sink.
function markConnectionControlSinks(ctx) {
  for (const { fact, unit } of ctx.connectionControlUnits) {
    const params = new Set();
    if (isFunctionLike(unit)) {
      for (const parameter of unit.parameters)
        if (ts.isIdentifier(parameter.name)) params.add(parameter.name.text);
    }
    if (params.size > 0) ctx.markSink(fact, unit, params);
  }
}

function analysisSize({ legacySinks, tenantState }) {
  return (
    tenantState.size +
    [...legacySinks.values()].reduce((total, sink) => total + 1 + sink.params.size, 0)
  );
}

function reportOnce(ctx, seen, id, { file, fact, reference }, detail) {
  if (seen.has(id)) return;
  seen.add(id);
  ctx.violate(file, reference.node, fact.sourceFile, 'C1', detail);
}

/** One sweep over sink callers; true when it added a sink. */
function propagateSinkEdges(ctx, reportedEdges) {
  let grew = false;
  forEachOrigin(
    ctx,
    () => false,
    site => {
      if (judgeSinkEdge(ctx, reportedEdges, site)) grew = true;
    }
  );
  return grew;
}

function judgeSinkEdge(ctx, reportedEdges, site) {
  const { file, fact, reference, origin, form } = site;
  const key = originKey(origin);
  const sink = key && ctx.legacySinks.get(key);
  if (!sink) return false;
  const caller = unitOf(reference.node);
  if (sink.file === file && caller === sink.unit) return false;
  if (form === 'export') return false;
  const edge = `${file}:${reference.node.pos}->${key}`;
  const report = detail => reportOnce(ctx, reportedEdges, edge, site, detail);
  if (form !== 'call' && form !== 'jsx') {
    report(`legacy tenant sink ${key} used as ${form}`);
    return false;
  }
  if (!fact.unchanged(caller) && !ctx.c1AdmittedEdge(fact, caller, key)) {
    // A state writer (A5-r2) admits a changed caller whose arguments are fixed: built
    // without the caller's parameters and from unchanged code only.
    if (!sink.writer) report(`changed caller hands a tenant to unchanged legacy ${key}`);
    else if (!writerArgumentsFixed(ctx, fact, caller, sink, reference)) {
      report(`changed caller hands an input to the tenant-state writer ${key}`);
    }
    return false;
  }
  const { params, external } = ctx.expressionDependencies(
    fact,
    caller,
    ctx.sinkArguments(sink, reference.node)
  );
  const dependencies = ctx.dependenciesUnchanged(fact, external);
  if (!dependencies.ok) {
    report(`call into legacy ${key} depends on changed code (${dependencies.witness})`);
    return false;
  }
  ctx.collectTenantState(fact, external);
  return params.size > 0 && ctx.markSink(fact, caller, params);
}

function writerArgumentsFixed(ctx, fact, caller, sink, reference) {
  const fixed = ctx.expressionDependencies(fact, caller, ctx.sinkArguments(sink, reference.node));
  const dependencies = ctx.dependenciesUnchanged(fact, fixed.external);
  return fixed.params.size === 0 && dependencies.ok;
}

function checkTenantStateUses(ctx, reportedState) {
  const { expressionDependencies, markSink, pinnedModules, stateUseProblem, tenantState } = ctx;
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
  forEachOrigin(
    ctx,
    file => pinnedModules.has(file),
    site => {
      const { file, fact, reference, origin, form } = site;
      const key = originKey(origin);
      if (!key || !tenantState.has(key) || form === 'export') return;
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
      if (!problem) return;
      reportOnce(
        ctx,
        reportedState,
        `${file}:${reference.node.pos}`,
        site,
        `module state ${key} read by a retained legacy tenant ${problem}; migrate that read to withTenantAuthority`
      );
    }
  );
}
