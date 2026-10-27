// Actual complete finalizer body with explicit imported dependency doubles; no producer authority.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
const data = text => 'data:text/javascript;base64,' + Buffer.from(text).toString('base64');
const moduleText = name => fs.readFileSync(new URL(name, import.meta.url), 'utf8');
export async function fullModeFinalizer(f) {
  const key = 'm4-full-finalizer-unit-' + randomUUID(),
    state = f.state;
  globalThis[key] = f;
  const ref = 'globalThis[' + JSON.stringify(key) + ']';
  Object.assign(state.prepared, {
    adoption: { commit: 'unit', tree: 'unit', critical: [] },
    trusted: new Map([...state.prepared.inventory.changed].map(file => [file, 'unit'])),
    baselineBytes: Buffer.from('{}'),
    baseline: { entries: [] },
    providerFiles: new Set(),
    producerHarnessFiles: new Set(),
    namedProofFiles: new Set(),
    providerEntries: [],
    directChanges: new Set(),
    moduleTargets: [],
    firstInvalidatingDependency: new Map(),
    providerPolicy: { runtimeEnforcement: true },
  });
  state.snapshot = f.graph.graphSnapshot(state.prepared);
  state.input.snapshot = state.snapshot;
  state.priorUnknown = ['bounded genuine prior UNKNOWN', 'second distinct UNKNOWN'];
  state.priorReads = 0;
  state.runtimeReject = false;
  const runtimeShims = {
    './db-access-mount-evidence.mjs':
      'export const mountEvidence=(_d,_i,graph)=>{' + ref + '.state.runtimeGraph=graph;return[];};',
    './db-access-message-proof-source.mjs':
      'export const messageProofObligations=(_p,_f,incomplete)=>{if(' +
      ref +
      '.state.runtimeReject)throw Error("bounded actual runtime rejection");return{operations:[],remaining:incomplete};};',
    './db-access-crm-proof-source.mjs':
      'export const crmProofObligations=()=>({operations:[],remaining:[]});',
  };
  const runtimeURL = data(
    moduleText('db-access-runtime-obligations.mjs').replace(/from '([^']+)'/gu, (_m, spec) => {
      assert(Object.hasOwn(runtimeShims, spec));
      return 'from ' + JSON.stringify(data(runtimeShims[spec]));
    })
  );
  const shims = {
    './db-access-graph-workers.mjs':
      'export const isOwnedM4ObservationGraph=(...a)=>' +
      ref +
      '.graph.isOwnedM4ObservationGraph(...a);',
    './db-access-evaluator.mjs':
      'export const isOwnedOrdinarySynchronousGraph=(...a)=>' +
      ref +
      '.evaluator.isOwnedOrdinarySynchronousGraph(...a);',
    './db-access-m4-native-prerequisite.mjs':
      'export const m4NativePrerequisites=(...a)=>' + ref + '.native.m4NativePrerequisites(...a);',
    './db-access-status-return-equivalence.mjs':
      'export const classifyStatusReturnEquivalence=()=>({});',
    './db-access-default-email-equivalence.mjs':
      'export const classifyDefaultEmailEquivalence=()=>({});',
    './db-access-claim-history-correspondence.mjs':
      'export const classifyClaimHistoryCorrespondence=()=>({});',
    './db-access-proof-report.mjs': 'export const proofReport=()=>({});',
    './db-access-runtime-obligations.mjs':
      'export {runtimeProofObligations} from ' + JSON.stringify(runtimeURL) + ';',
    './db-access-trust.mjs': 'export const digest=()=>"explicit-unit-digest";',
    './db-access-inventory.mjs': 'export const isUnsafe=()=>false;',
    './db-access-m4-prior-preparation.mjs':
      'export const priorControlsFor=()=>{' +
      ref +
      '.state.priorReads++;return{analysisUnknown:' +
      ref +
      '.state.priorUnknown,priorScoped:[]};};',
    './db-access-root-diagnostics.mjs': 'export const rootDiagnostics=()=>[];',
  };
  let source = moduleText('db-access-finalize.mjs');
  source = source.replace(/from '([^']+)'/gu, (_all, spec) => {
    assert(Object.hasOwn(shims, spec), 'exact finalizer import ' + spec);
    return 'from ' + JSON.stringify(data(shims[spec]));
  });
  const api = await import(data(source));
  state.finalize = api.finalizeGuardAnalysis;
  return {
    ...api,
    close() {
      delete state.finalize;
      delete globalThis[key];
    },
  };
}
