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

const projectionAt = (repo, sha) =>
  parseAuthorityDocuments(
    git(repo, 'show', `${sha}:${PROGRAM}`),
    git(repo, 'show', `${sha}:${TRACKER}`)
  );

function projectionOrBootstrap(repo, sha) {
  try {
    return projectionAt(repo, sha);
  } catch (error) {
    if (isBootstrapAnchor(sha)) return null;
    throw error;
  }
}

export const authorityPathsTouched = (repo, base, head) =>
  base !== head &&
  git(repo, 'log', '--first-parent', '--format=%H', `${base}..${head}`, '--', ...CLOSEOUT) !== '';

export function locateAuthorityTransition(repo, anchor, repeatId = null) {
  let sha = anchor;
  const seen = new Set();
  for (let depth = 0; depth < HISTORY_LIMIT; depth += 1) {
    seen.add(sha);
    const projection = projectionOrBootstrap(repo, sha);
    if (!projection) return { kind: 'bootstrap', bootstrapAnchor: sha };
    if (projection.activeSlice) {
      const prior = projection.activeSlice;
      const base = prior.promotionBaseSha;
      if (repeatId !== prior.sliceId || !t117bChildContract(prior))
        return { kind: 'terminal', prior: projection, terminalProjectionSha: sha };
      if (seen.has(base) || !isAncestor(repo, base, sha))
        throw new Error(
          `invalid repeat-chain ancestry: repeatId=${repeatId} current=${sha} priorBase=${base}`
        );
      sha = base;
      continue;
    }
    const parent = git(repo, 'rev-parse', `${sha}^1`);
    const parentProjection = projectionOrBootstrap(repo, parent);
    if (!parentProjection) {
      return { kind: 'bootstrap', bootstrapAnchor: parent, bootstrapMergeSha: sha };
    }
    if (parentProjection.activeSlice) {
      return {
        kind: 'closeout_recorded',
        prior: parentProjection,
        terminalProjectionSha: parent,
        closeoutMergeSha: sha,
      };
    }
    sha = parent;
  }
  throw new Error('authority history exceeds bounded traversal');
}

const writerHash = paths => createHash('sha256').update(JSON.stringify(paths)).digest('hex');
const invalid = (childId, reason, extra = {}) => ({ status: 'invalid', childId, reason, ...extra });

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

function closeoutEvidence(repo, transition, terminal) {
  const { closeoutMergeSha: closeoutSha, prior, terminalProjectionSha: terminalSha } = transition;
  const mergeSha = terminal.product.mergeSha;
  const branch = `${prior.activeSlice.expectedProductBranch}-closeout`;
  const raw = pullByBranch(repo, branch, transition.closeoutMergeSha);
  if (!raw) return { state: 'missing' };
  const pull = attachPullFiles(repo, pullFacts(repo, raw));
  const result = verifyCloseout(
    { ...prior, lifecycle: 'inactive', activeSlice: null },
    {
      ...pull,
      prBaseSha: pull.baseSha,
      expectedHeadRef: branch,
      terminalAnchorIsAncestor: isAncestor(repo, mergeSha, terminalSha),
      authorityPathsChangedAfterTerminal: authorityPathsTouched(repo, mergeSha, terminalSha),
      baseSha: terminalSha,
      protectedMainSha: closeoutSha,
    }
  );
  return { pull, result };
}

export function collectT117BPredecessorEvidence(repo, projection) {
  const slice = projection.activeSlice;
  const child = t117bChildContract(slice);
  const childId = slice.sliceId;
  if (!child) return null;
  if (!child.predecessor) return { status: 'root', childId };
  try {
    const transition = locateAuthorityTransition(repo, slice.promotionBaseSha, childId);
    if (transition.kind !== 'closeout_recorded') {
      return invalid(childId, 'predecessor_closeout_missing');
    }
    const prior = transition.prior.activeSlice;
    const predecessor = child.predecessor;
    const identity = {
      predecessorSliceId: prior?.sliceId ?? null,
      predecessorWriterMapSha256: writerHash(prior?.productWriterPaths ?? []),
    };
    if (
      identity.predecessorSliceId !== predecessor.sliceId ||
      identity.predecessorWriterMapSha256 !== predecessor.writerHash
    ) {
      return invalid(childId, 'predecessor_identity_mismatch', identity);
    }
    const terminal = productEvidence(repo, transition.prior);
    const product = terminal.product;
    if (terminal.authority?.lifecycle !== 'consumed_on_merge') {
      return invalid(childId, 'predecessor_product_unverified', {
        ...identity,
        productState: product?.state ?? terminal.state,
        productMerged: product?.merged ?? false,
      });
    }
    const closeout = closeoutEvidence(repo, transition, terminal);
    if (
      closeout.result?.reason !== 'deterministic_closeout_recorded' ||
      closeout.pull?.mergeSha !== transition.closeoutMergeSha
    ) {
      return invalid(childId, 'predecessor_closeout_unverified', identity);
    }
    return {
      status: 'verified',
      childId,
      ...identity,
      productPrNumber: product.number,
      productState: product.state,
      productMerged: product.merged,
      productHeadSha: product.headSha,
      productHeadTree: product.headTree,
      productMergeSha: product.mergeSha,
      closeoutState: closeout.result.reason,
      closeoutMergeSha: transition.closeoutMergeSha,
    };
  } catch {
    return invalid(childId, 'predecessor_evidence_unavailable');
  }
}
