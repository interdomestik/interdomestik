import * as fs from 'node:fs';
import { join } from 'node:path';
import * as store from './approval-envelope-ledger-fs.mjs';
export const AUTHORITY_ROOT =
  '/Users/arbenlila/.codex/state/interdomestik/ida-wf01-one-approval-delivery';
export const CHILDREN =
  'B0-authority-bootstrap,B1-cd-guard,S1A-skill-authority,S1B-routing-standard,S2-mcp-identity,S3-exact-authority,S4A-terminal-delivery,S4B-reviewer-policy'.split(
    ','
  );
const FAILURES = new Set('failed_consumed,rolled_back_consumed,incident,failed'.split(','));
const FAILURE_LIST =
  'active>failed_consumed,active>incident,prepared>failed_consumed,prepared>incident,installing>rolled_back_consumed,installing>incident,merged_consumed>incident,installed_consumed>incident,failed_consumed>failed,rolled_back_consumed>failed,incident>failed,closeout_required>failed';
const FAILURE_EDGES = new Set(FAILURE_LIST.split(','));
const STATUS_LIST =
  'active,prepared,installing,merged_consumed,installed_consumed,closeout_required,failed_consumed,rolled_back_consumed,incident,failed,closed';
const STATUSES = new Set(STATUS_LIST.split(','));
const TRANSITION_LIST =
  'active>merged_consumed:merge_consumed,active>prepared:prepared,prepared>installing:installing,installing>installed_consumed:install_consumed,merged_consumed>active:health_cleanup_pass,installed_consumed>active:health_cleanup_pass,merged_consumed>closeout_required:health_cleanup_pass,closeout_required>closed:success_closeout';
const TRANSITIONS = Object.fromEntries(TRANSITION_LIST.split(',').map(rule => rule.split(':')));
const STATE_KEYS =
  'schemaVersion,programId,revision,status,childId,runtimeAuthorized,successorsBlocked,envelopeSha256,approvalReceiptSha256,boundary,evidenceRef,previousOperationSha256'.split(
    ','
  );
const EVIDENCE_KEYS =
  'schemaVersion,programId,revision,event,fromChild,toChild,boundary,previousOperationSha256,proofSha256'.split(
    ','
  );
const STABLE_EDGE = /prepared>installing|installing>installed|consumed>closeout|_required>closed/;
function validate(state, initial = false) {
  store.exactKeys(state, STATE_KEYS);
  store.must(state.schemaVersion === 1 && state.programId === 'IDA-WF01-ONE-APPROVAL-DELIVERY');
  store.must(Number.isSafeInteger(state.revision) && state.revision > 0);
  store.must(STATUSES.has(state.status) && CHILDREN.includes(state.childId));
  store.must([state.runtimeAuthorized, state.successorsBlocked].every(v => typeof v === 'boolean'));
  store.must(state.runtimeAuthorized === /^(active|prepared|installing)$/.test(state.status));
  store.must(state.successorsBlocked === FAILURES.has(state.status));
  store.must([state.envelopeSha256, state.approvalReceiptSha256].every(v => store.hex(v, 64)));
  store.must(/^evidence\/[A-Za-z0-9-]+-[0-9a-f]{64}\.json$/.test(state.evidenceRef));
  const first = state.revision === 1,
    previous = state.previousOperationSha256;
  store.must(first ? previous === null : store.hex(previous, 64));
  store.must(
    !['closed', 'closeout_required'].includes(state.status) || state.childId === CHILDREN.at(-1)
  );
  if (first) store.must(state.status === 'active' && state.childId === CHILDREN[1]);
  if (initial) store.must(first);
  store.validBoundary(state.boundary, FAILURES.has(state.status));
}
export function evidenceReference(evidence) {
  store.exactKeys(evidence, EVIDENCE_KEYS);
  const program = evidence.programId === 'IDA-WF01-ONE-APPROVAL-DELIVERY';
  store.must(evidence.schemaVersion === 1 && program);
  store.must(Number.isSafeInteger(evidence.revision) && typeof evidence.event === 'string');
  store.must(CHILDREN.includes(evidence.fromChild) && CHILDREN.includes(evidence.toChild));
  store.must(store.hex(evidence.proofSha256, 64));
  store.must(
    evidence.previousOperationSha256 === null || store.hex(evidence.previousOperationSha256, 64)
  );
  store.validBoundary(evidence.boundary, /fail|incident|rollback/.test(evidence.event));
  return `evidence/${evidence.fromChild}-${store.sha(store.body(evidence))}.json`;
}
const read = (root, dirty = false) => store.readAuthority(root, validate, evidenceReference, dirty);
function transition(current, next, evidence) {
  store.must(next.revision === current.revision + 1, 'invalid transition');
  store.must(next.previousOperationSha256 === current.operationSha256, 'invalid transition');
  const fixed = ['programId', 'envelopeSha256', 'approvalReceiptSha256'];
  const sameAuthority = fixed.every(key => next[key] === current[key]);
  store.must(sameAuthority, 'invalid transition');
  store.must(evidenceReference(evidence) === next.evidenceRef, 'invalid transition evidence');
  store.must(evidence.revision === next.revision && evidence.fromChild === current.childId);
  store.must(evidence.toChild === next.childId, 'invalid transition evidence');
  const edge = `${current.status}>${next.status}`;
  const failure = FAILURES.has(next.status);
  const event = failure ? next.status : TRANSITIONS[edge];
  store.must(failure ? FAILURE_EDGES.has(edge) : event, 'invalid transition');
  store.must(evidence.event === event, 'invalid transition event');
  if (edge.endsWith('consumed>active')) {
    store.must(next.childId === CHILDREN[CHILDREN.indexOf(current.childId) + 1]);
    store.must(store.same(next.boundary, current.boundary));
  } else store.must(next.childId === current.childId);
  if (STABLE_EDGE.test(edge)) store.must(store.same(next.boundary, current.boundary));
}
const currentState = (root, expected, recover) =>
  expected === null && (!recover || !store.exists(store.authorityPaths(root).target))
    ? null
    : read(root, recover);
function persist(path, content, directory) {
  if (!store.exists(path)) store.writeNew(path, content);
  else store.must(store.regular(path) && store.text(path) === content, 'partial mismatch');
  if (directory) store.flush(directory);
}
function commit(root, expected, state, options = {}) {
  validate(state, expected === null);
  const evidence = options.evidence;
  store.must(evidenceReference(evidence) === state.evidenceRef, 'invalid transition evidence');
  store.must(evidence.revision === state.revision && evidence.toChild === state.childId);
  store.must(
    store.same(evidence.boundary, state.boundary) &&
      evidence.previousOperationSha256 === state.previousOperationSha256
  );
  if (expected === null)
    store.must(evidence.event === 'health_cleanup_pass' && evidence.fromChild === CHILDREN[0]);
  const operation = store.sha(JSON.stringify(state));
  const current = currentState(root, expected, Boolean(options.recover));
  if (options.recover && current?.operationSha256 === operation) {
    const marker = store.claim(root, operation, expected, options);
    store.release(root, marker);
    return current;
  }
  if (current) {
    store.must(current.revision === expected.revision, 'stale authority state');
    store.must(current.operationSha256 === expected.operation, 'stale authority state');
    transition(current, state, evidence);
  }
  const marker = store.claim(root, operation, expected, options);
  let mutated = Boolean(options.beforePublish);
  try {
    const paths = store.authorityPaths(root);
    const observe = () => (store.exists(paths.target) ? read(root, true) : null);
    store.must(store.same(observe(), current), 'stale authority state');
    options.beforePublish?.(marker);
    const record = { ...state, operationSha256: operation };
    const artifacts = [
      [join(root, state.evidenceRef), store.body(evidence), paths.evidence],
      [join(paths.receipts, `${operation}.json`), store.body(record), paths.receipts],
    ];
    for (const [path, content, directory] of artifacts) {
      mutated = true;
      persist(path, content, directory);
    }
    const temporary = `${paths.target}.tmp-${operation}`;
    mutated ||= store.exists(temporary);
    persist(temporary, store.body(record));
    store.must(store.same(observe(), current), 'stale authority state');
    fs.renameSync(temporary, paths.target);
    store.flush(root);
    store.release(root, marker);
    return record;
  } catch (error) {
    if (!mutated) store.releaseUnmutated(root, marker);
    throw error;
  }
}
export { commit as installLedger, commit as transitionLedger };
export function resolveLedger(root, live) {
  try {
    root ||= AUTHORITY_ROOT;
    const state = read(root);
    if (state.runtimeAuthorized) {
      store.exactKeys(live, ['operationSha256', 'childId', 'disposition']);
      store.must(live.operationSha256 === state.operationSha256 && live.childId === state.childId);
      store.must(live.disposition === 'open', 'inactive live authority');
    }
    return { ...state, activeSlice: state.runtimeAuthorized ? state.childId : null };
  } catch (error) {
    const reason = error.message === 'incomplete_operation' ? error.message : 'invalid_state';
    return { runtimeAuthorized: false, activeSlice: null, successorsBlocked: true, reason };
  }
}
