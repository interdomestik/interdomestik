import {
  canonicalJson,
  exactKeys,
  must,
  normalizeCommitSha,
  sha256,
} from './slice-rehearse-canonical.mjs';

const contexts = new WeakMap();
const collectedSnapshots = new WeakMap();
const fields =
  'schemaVersion complete origin sliceId promotionSha protectedMainSha execution promotionIsAncestor baseIsAncestor scopeSha256 expectedMaterial material approval proof'.split(
    ' '
  );
const materialFields =
  'dependencies policyTrust callerClosure approval scopeRisk capacityInventory capacityBudget capacityOwners plannedCandidate protection requiredContextsApps mergeMode eligibility proofInputs'.split(
    ' '
  );
const identityFields = 'baseSha headSha treeSha remoteHeadSha'.split(' ');
const hash = value => sha256(canonicalJson(value));
const digest = value =>
  must(typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value), 'recovery digest invalid');

// Only host code supplies this synchronous reader. No CLI/env/manifest path creates a context.
// Installed host provenance and provider observation remain obligations of the trusted caller.
export function createRecoveryContext(readCurrent) {
  must(typeof readCurrent === 'function', 'trusted recovery reader required');
  const context = Object.freeze({});
  contexts.set(context, readCurrent);
  return context;
}

export function assertRecoveryContext(context) {
  must(contexts.has(context), 'trusted recovery context required');
}

export function readRecoveryContext(context) {
  const read = contexts.get(context);
  must(read, 'trusted recovery context required');
  const input = read();
  must(input && typeof input.then !== 'function', 'synchronous recovery evidence required');
  const s = structuredClone(input);
  exactKeys(s, fields, 'recovery evidence');
  must(s.schemaVersion === 1 && s.complete === true, 'complete recovery evidence required');
  must(
    s.origin === 'https://github.com/interdomestik/interdomestik.git',
    'recovery origin differs'
  );
  must(typeof s.sliceId === 'string' && s.sliceId.length > 0, 'recovery slice missing');
  for (const key of ['promotionSha', 'protectedMainSha']) normalizeCommitSha(s[key], key);
  exactKeys(s.execution, identityFields, 'recovery execution');
  for (const key of identityFields) normalizeCommitSha(s.execution[key], key);
  must(s.promotionIsAncestor === true && s.baseIsAncestor === true, 'recovery ancestry unverified');
  digest(s.scopeSha256);
  for (const object of [s.expectedMaterial, s.material]) {
    exactKeys(object, materialFields, 'recovery materiality');
    for (const key of materialFields) digest(object[key]);
  }
  must(canonicalJson(s.expectedMaterial) === canonicalJson(s.material), 'recovery material drift');
  exactKeys(
    s.approval,
    ['valid', 'generation', 'receiptSha256', 'bindingSha256', 'semanticSha256'],
    'recovery approval'
  );
  must(
    s.approval.valid === true &&
      Number.isSafeInteger(s.approval.generation) &&
      s.approval.generation > 0,
    'current recovery approval invalid'
  );
  for (const key of ['receiptSha256', 'bindingSha256', 'semanticSha256']) digest(s.approval[key]);
  if (s.proof !== null) {
    exactKeys(s.proof, ['passed', 'identitySha256'], 'recovery proof');
    digest(s.proof.identitySha256);
    must(typeof s.proof.passed === 'boolean', 'recovery proof invalid');
  }
  return s;
}

export function recoveryExecutionBase(projection, facts, context) {
  const s = readRecoveryContext(context),
    e = s.execution;
  if (collectedSnapshots.has(facts.local))
    must(
      collectedSnapshots.get(facts.local) === hash(s),
      'recovery evidence changed after collection'
    );
  must(
    s.sliceId === projection.activeSlice.sliceId && s.scopeSha256 === hash(projection),
    'recovery scope differs'
  );
  must(
    s.promotionSha === facts.promotion.mergeSha && s.protectedMainSha === facts.protectedMainSha,
    'recovery main identity differs'
  );
  const product = facts.product;
  const head = product?.headSha ?? facts.local?.headSha;
  const tree = product?.headTree ?? facts.local?.treeSha;
  must(e.headSha === head && e.treeSha === tree, 'recovery candidate differs');
  if (product) must(e.remoteHeadSha === product.headSha, 'recovery remote head differs');
  if (!product?.merged)
    must(e.baseSha === facts.protectedMainSha, 'recovery execution base differs');
  return e.baseSha;
}

export function recoverExecutionBase(projection, facts, context) {
  try {
    return recoveryExecutionBase(projection, facts, context);
  } catch {
    return null;
  }
}

export function collectLocalFacts(repo, promotionSha, context, git, changedPaths) {
  const headSha = git(repo, 'rev-parse', 'HEAD');
  const observed = context === undefined ? null : readRecoveryContext(context);
  const base = observed === null ? promotionSha : observed.execution.baseSha;
  const forkPointSha = git(repo, 'merge-base', headSha, base);
  if (observed !== null) {
    must(
      git(repo, 'merge-base', promotionSha, base) === promotionSha && forkPointSha === base,
      'local recovery ancestry differs'
    );
  }
  const local = {
    branch: git(repo, 'branch', '--show-current'),
    headSha,
    ...(context === undefined ? {} : { treeSha: git(repo, 'rev-parse', 'HEAD^{tree}') }),
    forkPointSha,
    changedPaths: changedPaths(repo, base),
  };
  if (observed !== null) collectedSnapshots.set(local, hash(observed));
  return local;
}

export function verifyRecoveryOperation(context, c, approved, semanticBinding) {
  const s = readRecoveryContext(context);
  must(s.origin === c.origin && s.sliceId === c.sliceId, 'recovery operation scope differs');
  const expected = {
    baseSha: c.baseSha,
    headSha: c.headSha,
    treeSha: c.treeSha,
    remoteHeadSha: c.expectedRemoteHeadSha,
  };
  must(
    canonicalJson(s.execution) === canonicalJson(expected) && s.protectedMainSha === c.baseSha,
    'recovery operation identity differs'
  );
  must(
    s.approval.receiptSha256 === approved.approvalReceiptSha256 &&
      c.approvalReceiptSha256 === approved.approvalReceiptSha256 &&
      s.approval.bindingSha256 === approved.approvalBindingSha256 &&
      s.approval.semanticSha256 === semanticBinding,
    'recovery approval binding differs'
  );
  must(
    s.proof?.passed === true && s.proof.identitySha256 === hash(expected),
    'fresh recovery proof required'
  );
  return s;
}

export function readRecoveryOperationEvidence(
  context,
  c,
  approved,
  semantic,
  verifyApproval,
  verifyCurrent
) {
  verifyApproval(approved);
  const before = verifyRecoveryOperation(context, c, approved, semantic);
  verifyCurrent();
  const after = verifyRecoveryOperation(context, c, approved, semantic);
  must(
    canonicalJson(before) === canonicalJson(after),
    'recovery evidence changed during verification'
  );
  return before;
}
