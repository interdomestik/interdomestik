import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  assertCanonicalWriterWorktree,
  attachPullFiles,
  changedPaths,
  classifyCloseoutPull,
  collectPromotionFacts,
  commitFacts,
  git,
  isClosedUnmergedPull,
  isAncestor,
  protectedMain,
  pullByBranch,
  pullFacts,
  validateRepositoryIdentity,
} from './lean-current-authority-git.mjs';
import {
  abandonAuthority,
  authorityState,
  failAuthority,
  resolveAuthority,
} from './lean-current-authority-lifecycle.mjs';
import { verifyCloseout } from './lean-current-authority-closeout.mjs';
import {
  authorityPathsTouched,
  collectT117BPredecessorEvidence,
  locateAuthorityTransition,
} from './lean-current-authority-history.mjs';
import {
  CLOSEOUT,
  PROGRAM,
  TRACKER,
  parseAuthorityDocuments,
  sameSet,
} from './lean-current-authority-policy.mjs';

function collectFacts(repo, projection, protectedMainSha) {
  const slice = projection.activeSlice;
  validateRepositoryIdentity(repo);
  assertCanonicalWriterWorktree(repo, protectedMainSha === undefined);
  const predecessor = collectT117BPredecessorEvidence(repo, projection);
  const productPull = pullByBranch(repo, slice.expectedProductBranch);
  if (isClosedUnmergedPull(productPull))
    return {
      protectedMainSha: protectedMain(repo, protectedMainSha),
      predecessor,
      product: { state: 'CLOSED', merged: false },
    };
  const product = productPull ? pullFacts(repo, productPull) : null;
  const promotion = collectPromotionFacts(repo, slice);
  if (promotion.merged === false)
    return {
      protectedMainSha: protectedMain(repo, protectedMainSha),
      predecessor,
      product,
      promotion,
    };
  if (product) attachPullFiles(repo, product);
  const localHead = git(repo, 'rev-parse', 'HEAD');
  return {
    protectedMainSha: protectedMain(repo, protectedMainSha),
    predecessor,
    promotion,
    product,
    local: {
      branch: git(repo, 'branch', '--show-current'),
      headSha: localHead,
      forkPointSha: git(repo, 'merge-base', localHead, promotion.mergeSha),
      changedPaths: changedPaths(repo, promotion.mergeSha),
    },
  };
}

function evaluateTerminal(repo, prior, anchor) {
  const facts = collectFacts(repo, prior, anchor);
  const terminal = resolveAuthority(prior, facts);
  if (!terminal.closeoutAuthorized) {
    return { result: failAuthority('closeout_terminal_unverified') };
  }
  const terminalSha = facts.product?.merged === true ? facts.product.mergeSha : anchor;
  const exactHistory =
    isAncestor(repo, terminalSha, anchor) && !authorityPathsTouched(repo, terminalSha, anchor);
  return exactHistory
    ? { prior, terminalSha }
    : { result: failAuthority('closeout_terminal_drift') };
}

function pendingCloseout(repo, pull, branch, anchor, localHead) {
  const pending = pull ? attachPullFiles(repo, pullFacts(repo, pull)) : null;
  const exact =
    git(repo, 'branch', '--show-current') === branch &&
    git(repo, 'merge-base', localHead, anchor) === anchor &&
    sameSet(changedPaths(repo, anchor), CLOSEOUT) &&
    (!pending ||
      (pending.state === 'OPEN' &&
        pending.inventoryComplete === true &&
        pending.baseSha === anchor &&
        pending.headRef === branch &&
        pending.headSha === localHead &&
        sameSet(pending.changedPaths, CLOSEOUT)));
  return exact
    ? authorityState('closeout_pending', 'exact_closeout_branch', {
        successorsBlocked: true,
        closeoutAuthorized: true,
      })
    : failAuthority('closeout_branch_identity_mismatch');
}

function mergedCloseout(repo, projection, pull, branch, terminalSha, anchor, main) {
  if (pull?.merged !== true) return failAuthority('closeout_merge_evidence_missing');
  const closeout = attachPullFiles(repo, pullFacts(repo, pull));
  return verifyCloseout(projection, {
    state: closeout.state,
    inventoryComplete: closeout.inventoryComplete,
    prBaseSha: closeout.baseSha,
    headRef: closeout.headRef,
    expectedHeadRef: branch,
    terminalAnchorIsAncestor: isAncestor(repo, terminalSha, anchor),
    authorityPathsChangedAfterTerminal: authorityPathsTouched(repo, terminalSha, anchor),
    baseSha: anchor,
    headTree: closeout.headTree,
    mergeSha: closeout.mergeSha,
    mergeParents: closeout.mergeParents,
    mergeTree: closeout.mergeTree,
    protectedMainSha: main,
    changedPaths: closeout.changedPaths,
  });
}

function resolveInactiveRepository(repo, projection) {
  try {
    validateRepositoryIdentity(repo);
  } catch {
    return failAuthority('repository_identity_untrusted');
  }
  const main = protectedMain(repo);
  const localHead = git(repo, 'rev-parse', 'HEAD');
  const mergedHere = localHead === main;
  const anchor = mergedHere ? commitFacts(repo, main).parents[0] : main;
  const transition = locateAuthorityTransition(repo, anchor);
  if (transition.kind === 'bootstrap') return authorityState('inactive', 'no_active_slice');
  const terminal = evaluateTerminal(repo, transition.prior, transition.terminalProjectionSha);
  if (terminal.result) return terminal.result;
  const branch = `${terminal.prior.activeSlice.expectedProductBranch}-closeout`;
  const pullAnchor = transition.kind === 'closeout_recorded' ? transition.closeoutMergeSha : main;
  const pull = pullByBranch(repo, branch, pullAnchor);
  const pullDisposition = classifyCloseoutPull(pull);
  if (pullDisposition === 'malformed') return failAuthority('closeout_state_malformed');
  if (pullDisposition === 'abandoned') return abandonAuthority('closeout_closed_unmerged');
  if (transition.kind === 'closeout_recorded') {
    const recorded = mergedCloseout(
      repo,
      projection,
      pull,
      branch,
      terminal.terminalSha,
      transition.terminalProjectionSha,
      transition.closeoutMergeSha
    );
    if (recorded.lifecycle === 'blocked') return recorded;
    const unchangedDescendant =
      isAncestor(repo, transition.closeoutMergeSha, main) &&
      !authorityPathsTouched(repo, transition.closeoutMergeSha, main);
    return unchangedDescendant ? recorded : failAuthority('closeout_terminal_drift');
  }
  return mergedHere
    ? mergedCloseout(repo, projection, pull, branch, terminal.terminalSha, anchor, main)
    : pendingCloseout(repo, pull, branch, anchor, localHead);
}

export function resolveRepositoryAuthority(repoInput = process.cwd(), live = true) {
  try {
    const repo = resolve(repoInput);
    const projection = parseAuthorityDocuments(
      readFileSync(resolve(repo, PROGRAM), 'utf8'),
      readFileSync(resolve(repo, TRACKER), 'utf8')
    );
    if (!live) return resolveAuthority(projection);
    return projection.activeSlice
      ? resolveAuthority(projection, collectFacts(repo, projection))
      : resolveInactiveRepository(repo, projection);
  } catch {
    return failAuthority('authority_evidence_unavailable');
  }
}

export {
  assertCanonicalWriterWorktree,
  classifyCloseoutPull,
  isBootstrapAnchor,
  isClosedUnmergedPull,
  selectFullProductPull,
  isCanonicalOrigin,
} from './lean-current-authority-git.mjs';
