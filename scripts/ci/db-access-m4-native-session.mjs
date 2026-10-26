import { currentM4SessionAuthority } from './db-access-m4-session-authority.mjs';
import { randomUUID } from 'node:crypto';
import { prepareGuard } from './db-access-prepare.mjs';
import { finalizeGuardAnalysis } from './db-access-finalize.mjs';
import { ADOPTION } from './db-access-adoption.mjs';
import { PROVIDER_UNIT_POLICY } from './db-access-provider-unit-policy.mjs';
import {
  startGraphWorkerPool,
  assertM4WorkerEvidenceCurrent,
} from './db-access-graph-worker-pool.mjs';
import {
  assertWorkerCode,
  assertOwnedGraphOutput,
  runParallelGraph,
  graphSnapshot,
  encodeInventory,
} from './db-access-graph-workers.mjs';
import { isM4ContextInventory } from './db-access-m4-native-prerequisite.mjs';
import { m4SourceMatchesModel } from './db-access-m4-proof-source.mjs';
import { outputShape, sameOutputShape, freezeOutput } from './db-access-output-binding.mjs';

const sessions = new WeakMap();
const fail = reason => {
  throw Error('incomplete: M4 native session ' + reason);
};
const publicRows = rows =>
  rows.map(row => Object.fromEntries(Object.entries(row).filter(([key]) => !key.startsWith('_'))));
const rawOutput = analysis => ({
  failures: publicRows(analysis.rawFailures),
  diagnostics: analysis.rawDiagnostics,
  diagnosticCount: analysis.rawDiagnosticCount,
});
function nativeCurrent(prepared) {
  const native = prepared.m4NativeInventory;
  if (
    !native ||
    native.model !== prepared.model ||
    native.inventory !== prepared.inventory ||
    native.source !== prepared.providerUnit?.m4Proof ||
    !m4SourceMatchesModel(native.source, native.model) ||
    !isM4ContextInventory(native.model, native.inventory, native.source)
  )
    fail('native source/model/inventory ownership');
}

// The sole minting path executes the fixed producer's preparation, owned workers and
// finalization itself. There is no prepared/graph/receipt/options argument.
export async function evaluateM4NativeSession(repoRoot) {
  assertWorkerCode(repoRoot);
  const prepared = prepareGuard(repoRoot, ADOPTION, PROVIDER_UNIT_POLICY);
  nativeCurrent(prepared);
  const authorityDigest = currentM4SessionAuthority(prepared);
  const pool = startGraphWorkerPool(repoRoot);
  try {
    const snapshot = graphSnapshot(prepared);
    const inventory = encodeInventory(prepared);
    const graph = await runParallelGraph(prepared, { snapshot, inventory }, pool);
    const workerOutputDigest = assertOwnedGraphOutput(graph);
    const rawGraph = {
      ...graph,
      incomplete: [...graph.incomplete],
      ...(graph.m4Contexts
        ? { m4Contexts: { ...graph.m4Contexts, unresolved: [...graph.m4Contexts.unresolved] } }
        : {}),
      reachedTestSources: [...graph.reachedTestSources],
    };
    const analysis = finalizeGuardAnalysis(prepared, graph, true);
    nativeCurrent(prepared);
    if (currentM4SessionAuthority(prepared) !== authorityDigest)
      fail('authority changed during analysis');
    if (graphSnapshot(prepared) !== snapshot) fail('source changed during finalization');
    assertWorkerCode(repoRoot);
    const view = freezeOutput({
      version: 1,
      authorityDigest,
      snapshot,
      modelDigest: outputShape([...prepared.model.sources]).digest,
      sourcePolicyDigest: prepared.providerUnit.m4Proof.policyDigest,
      sourceBookends: prepared.providerUnit.m4Proof.bookends,
      workerOutputDigest,
      inventory,
      rawGraph,
      raw: rawOutput(analysis),
      report: analysis.report,
      runtimeEvidenceAccepted: false,
      runtimeAdmission: false,
      allExecutableContextsQualified: false,
    });
    const outputValue = { graph, report: analysis.report, view };
    const output = outputShape(outputValue);
    const handle = Object.freeze({ version: 1, id: randomUUID(), outputDigest: output.digest });
    sessions.set(handle, {
      prepared,
      graph,
      analysis,
      view,
      snapshot,
      authorityDigest,
      outputValue,
      output,
      rawDigest: outputShape(view.raw).digest,
      rawRows: [...analysis.rawFailures],
      rawFailures: analysis.rawFailures,
      rawDiagnostics: analysis.rawDiagnostics,
      rawDiagnosticRows: [...analysis.rawDiagnostics],
      model: prepared.model,
      source: prepared.providerUnit.m4Proof,
      native: prepared.m4NativeInventory,
      modelDigest: view.modelDigest,
    });
    return handle;
  } finally {
    await pool.close();
  }
}

// Only this live handle is authority. The frozen projection is inspectable evidence,
// never an independently admissible receipt; a future join must assert the handle.
export function assertM4NativeSessionCurrent(handle) {
  const state = sessions.get(handle);
  if (!state) fail('foreign or serialized handle');
  const { prepared, graph, analysis } = state;
  nativeCurrent(prepared);
  if (currentM4SessionAuthority(prepared) !== state.authorityDigest)
    fail('changed current resolver/baseline/config authority');
  assertM4WorkerEvidenceCurrent(graph.m4WorkerTransport);
  assertWorkerCode(prepared.repoRoot);
  if (
    prepared.model !== state.model ||
    prepared.providerUnit.m4Proof !== state.source ||
    prepared.m4NativeInventory !== state.native ||
    graphSnapshot(prepared) !== state.snapshot ||
    outputShape([...prepared.model.sources]).digest !== state.modelDigest ||
    state.outputValue.graph !== graph ||
    state.outputValue.report !== analysis.report ||
    !sameOutputShape(state.output, state.outputValue) ||
    state.rawFailures !== analysis.rawFailures ||
    state.rawDiagnostics !== analysis.rawDiagnostics ||
    state.rawDiagnosticRows.length !== analysis.rawDiagnostics.length ||
    state.rawDiagnosticRows.some((row, index) => row !== analysis.rawDiagnostics[index]) ||
    state.rawRows.length !== analysis.rawFailures.length ||
    state.rawRows.some((row, index) => row !== analysis.rawFailures[index]) ||
    outputShape(rawOutput(analysis)).digest !== state.rawDigest
  )
    fail('changed/replaced source or native output');
  return state.view;
}
