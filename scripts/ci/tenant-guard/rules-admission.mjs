// Tenant guard stage: reviewed C1 admissions (see c1-admissions.mjs). An admission activates only
// for its complete, byte-identical bundle, and then names exact top-level units and sink edges.

import { C1_ADMISSIONS } from './c1-admissions.mjs';
import { sha256 } from './rules-digest.mjs';
import { unitName } from './syntax.mjs';

/** Installs `c1Admitted(fact, unit)` and `c1AdmittedEdge(fact, caller, sinkKey)` on `ctx`. */
export function installAdmission(ctx, admissions = C1_ADMISSIONS) {
  const units = new Set();
  const edges = new Set();
  const active = [];
  for (const admission of admissions) {
    if (!bundleMatches(ctx.graph, admission)) continue;
    active.push(admission.id);
    for (const { file, units: names } of admission.files) {
      for (const name of names) units.add(`${file}#${name}`);
    }
    for (const { file, unit, sink } of admission.sinkEdges) edges.add(`${file}#${unit}->${sink}`);
  }
  ctx.telemetry.c1Admissions = active.length;

  // The unit must be the file's own top-level declaration of that name, never a nested namesake.
  const admittedName = (fact, unit) => {
    if (!unit || active.length === 0) return null;
    const name = unitName(unit, fact.sourceFile);
    if (!name || fact.declarations.get(name) !== unit) return null;
    return units.has(`${fact.file}#${name}`) ? `${fact.file}#${name}` : null;
  };
  ctx.c1Admitted = (fact, unit) => admittedName(fact, unit) !== null;
  ctx.c1AdmittedEdge = (fact, caller, sinkKey) => {
    const key = admittedName(fact, caller);
    return key !== null && edges.has(`${key}->${sinkKey}`);
  };
}

function bundleMatches(graph, admission) {
  return admission.files.every(({ file, sha256: expected }) => {
    const sourceFile = graph.sourceFileOf(file);
    return sourceFile !== null && sourceFile !== undefined && sha256(sourceFile.text) === expected;
  });
}
