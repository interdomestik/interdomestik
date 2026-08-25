import { authorityState, failAuthority } from './lean-current-authority-lifecycle.mjs';
import {
  CLOSEOUT,
  SHA40,
  same,
  sameSet,
  validateProjection,
} from './lean-current-authority-policy.mjs';

export function verifyCloseout(projectionInput, facts = {}) {
  let projection;
  try {
    projection = validateProjection(projectionInput);
  } catch (error) {
    return failAuthority('closeout_projection_invalid', { error: error.message });
  }
  const exact =
    projection.lifecycle === 'inactive' &&
    projection.activeSlice === null &&
    facts.state === 'CLOSED' &&
    facts.inventoryComplete === true &&
    facts.prBaseSha === facts.baseSha &&
    facts.headRef === facts.expectedHeadRef &&
    facts.terminalAnchorIsAncestor === true &&
    facts.authorityPathsChangedAfterTerminal === false &&
    [facts.baseSha, facts.headTree, facts.mergeSha].every(sha => SHA40.test(sha ?? '')) &&
    same(facts.mergeParents, [facts.baseSha]) &&
    facts.mergeTree === facts.headTree &&
    facts.protectedMainSha === facts.mergeSha &&
    sameSet(facts.changedPaths, CLOSEOUT);
  return exact
    ? authorityState('no_active_slice', 'deterministic_closeout_recorded')
    : failAuthority('closeout_identity_mismatch');
}
