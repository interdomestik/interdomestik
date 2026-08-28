import { createHash } from 'node:crypto';

import { t117bChildContract } from './lean-exact-writer-exceptions.mjs';
import {
  attachPullFiles,
  collectPromotionFacts,
  git,
  isAncestor,
  isBootstrapAnchor,
  pullByBranch,
  pullFacts,
} from './lean-current-authority-git.mjs';
import { verifyCloseout } from './lean-current-authority-closeout.mjs';
import { resolveAuthority } from './lean-current-authority-lifecycle.mjs';
import {
  CLOSEOUT,
  PROGRAM,
  TRACKER,
  parseAuthorityDocuments,
} from './lean-current-authority-policy.mjs';

const HISTORY_LIMIT = 128;

function projectionAt(repo, sha) {
  return parseAuthorityDocuments(
    git(repo, 'show', `${sha}:${PROGRAM}`),
    git(repo, 'show', `${sha}:${TRACKER}`)
  );
}

function projectionOrBootstrap(repo, sha) {
  try {
    return projectionAt(repo, sha);
  } catch (error) {
    if (isBootstrapAnchor(sha)) return null;
    throw error;
  }
}

export function authorityPathsTouched(repo, base, head) {
  if (base === head) return false;
  return (
    git(repo, 'log', '--first-parent', '--format=%H', `${base}..${head}`, '--', ...CLOSEOUT) !== ''
  );
}

export function locateAuthorityTransition(repo, anchor) {
  let current = anchor;
  for (let depth = 0; depth < HISTORY_LIMIT; depth += 1) {
    const projection = projectionOrBootstrap(repo, current);
    if (!projection) return { kind: 'bootstrap', bootstrapAnchor: current };
    if (projection.activeSlice) {
      return { kind: 'terminal', prior: projection, terminalProjectionSha: current };
    }
    const parent = git(repo, 'rev-parse', `${current}^1`);
    const parentProjection = projectionOrBootstrap(repo, parent);
    if (!parentProjection) {
      return { kind: 'bootstrap', bootstrapAnchor: parent, bootstrapMergeSha: current };
    }
    if (parentProjection.activeSlice) {
      return {
        kind: 'closeout_recorded',
        prior: parentProjection,
        terminalProjectionSha: parent,
        closeoutMergeSha: current,
      };
    }
    current = parent;
  }
  throw new Error('inactive authority history exceeds bounded first-parent search');
}

const writerHash = paths => createHash('sha256').update(JSON.stringify(paths)).digest('hex');
const invalid = (childId, reason, extra = {}) => ({
  status: 'invalid',
  childId,
  reason,
  ...extra,
});

function productEvidence(repo, projection) {
  const slice = projection.activeSlice;
  const raw = pullByBranch(repo, slice.expectedProductBranch);
  if (!raw) return { state: 'missing' };
  const product = attachPullFiles(repo, pullFacts(repo, raw));
  const authority = resolveAuthority(projection, {
    protectedMainSha: product.mergeSha,
    promotion: collectPromotionFacts(repo, slice),
    product,
    predecessor: collectT117BPredecessorEvidence(repo, projection),
  });
  return { authority, product };
}

function closeoutEvidence(repo, successor, transition, terminal) {
  const prior = transition.prior;
  const branch = `${prior.activeSlice.expectedProductBranch}-closeout`;
  const raw = pullByBranch(repo, branch);
  if (!raw) return { state: 'missing' };
  const pull = attachPullFiles(repo, pullFacts(repo, raw));
  const result = verifyCloseout(
    { ...prior, lifecycle: 'inactive', activeSlice: null },
    {
      state: pull.state,
      inventoryComplete: pull.inventoryComplete,
      prBaseSha: pull.baseSha,
      headRef: pull.headRef,
      expectedHeadRef: branch,
      terminalAnchorIsAncestor: isAncestor(
        repo,
        terminal.product.mergeSha,
        transition.terminalProjectionSha
      ),
      authorityPathsChangedAfterTerminal: authorityPathsTouched(
        repo,
        terminal.product.mergeSha,
        transition.terminalProjectionSha
      ),
      baseSha: transition.terminalProjectionSha,
      headTree: pull.headTree,
      mergeSha: pull.mergeSha,
      mergeParents: pull.mergeParents,
      mergeTree: pull.mergeTree,
      protectedMainSha: transition.closeoutMergeSha,
      changedPaths: pull.changedPaths,
    }
  );
  return { pull, result, successorBaseSha: successor.activeSlice.promotionBaseSha };
}

export function collectT117BPredecessorEvidence(repo, projection) {
  const slice = projection.activeSlice;
  const child = t117bChildContract(slice);
  if (!child) return null;
  if (!child.predecessor) return { status: 'root', childId: slice.sliceId };
  try {
    const transition = locateAuthorityTransition(repo, slice.promotionBaseSha);
    if (transition.kind !== 'closeout_recorded') {
      return invalid(slice.sliceId, 'predecessor_closeout_missing');
    }
    const priorSlice = transition.prior.activeSlice;
    const identity = {
      predecessorSliceId: priorSlice?.sliceId ?? null,
      predecessorWriterMapSha256: writerHash(priorSlice?.productWriterPaths ?? []),
    };
    if (
      identity.predecessorSliceId !== child.predecessor.sliceId ||
      identity.predecessorWriterMapSha256 !== child.predecessor.writerHash
    ) {
      return invalid(slice.sliceId, 'predecessor_identity_mismatch', identity);
    }
    const terminal = productEvidence(repo, transition.prior);
    if (terminal.authority?.lifecycle !== 'consumed_on_merge') {
      return invalid(slice.sliceId, 'predecessor_product_unverified', {
        ...identity,
        productState: terminal.product?.state ?? terminal.state,
        productMerged: terminal.product?.merged ?? false,
      });
    }
    const closeout = closeoutEvidence(repo, projection, transition, terminal);
    if (
      closeout.result?.reason !== 'deterministic_closeout_recorded' ||
      closeout.pull?.mergeSha !== transition.closeoutMergeSha
    ) {
      return invalid(slice.sliceId, 'predecessor_closeout_unverified', identity);
    }
    return {
      status: 'verified',
      childId: slice.sliceId,
      ...identity,
      productPrNumber: terminal.product.number,
      productState: terminal.product.state,
      productMerged: terminal.product.merged,
      productHeadSha: terminal.product.headSha,
      productHeadTree: terminal.product.headTree,
      productMergeSha: terminal.product.mergeSha,
      closeoutState: closeout.result.reason,
      closeoutMergeSha: transition.closeoutMergeSha,
    };
  } catch {
    return invalid(slice.sliceId, 'predecessor_evidence_unavailable');
  }
}
