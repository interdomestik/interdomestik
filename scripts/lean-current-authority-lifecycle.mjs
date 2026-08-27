import {
  SHA40,
  approvalMarker,
  classifyWriterPath,
  same,
  validPromotionWriterPaths,
  validateProjection,
} from './lean-current-authority-policy.mjs';

export const authorityState = (lifecycle, reason, extra = {}) => ({
  lifecycle,
  runtimeAuthorized: false,
  activeSlice: null,
  successorsBlocked: lifecycle !== 'inactive' || reason !== 'no_active_slice',
  closeoutAuthorized: false,
  reason,
  ...extra,
});
export const failAuthority = (reason, extra) => authorityState('blocked', reason, extra);
export const abandonAuthority = reason =>
  authorityState('inactive', reason, {
    closeoutAuthorized: true,
    failureCloseoutRequired: true,
  });

export function classifyCloseoutPull(pull) {
  if (!pull) return 'missing';
  if (!['open', 'closed'].includes(pull.state) || typeof pull.merged !== 'boolean') {
    return 'malformed';
  }
  if (pull.state === 'open' && pull.merged) return 'malformed';
  return pull.state === 'closed' && !pull.merged ? 'abandoned' : 'continuing';
}

function writerSubset(actual, slice) {
  const allowed = slice.productWriterPaths;
  return (
    Array.isArray(actual) &&
    new Set(actual).size === actual.length &&
    actual.every(path => allowed.includes(path) && classifyWriterPath(path, slice).allowed)
  );
}

function exactPromotion(slice, pull) {
  return (
    pull?.number === slice.promotionPrNumber &&
    pull.state === 'CLOSED' &&
    pull.merged === true &&
    pull.baseSha === slice.promotionBaseSha &&
    [pull.headSha, pull.headTree, pull.mergeSha].every(sha => SHA40.test(sha)) &&
    same(pull.mergeParents, [slice.promotionBaseSha]) &&
    pull.mergeTree === pull.headTree
  );
}

const exactPromotionScope = (slice, pull) =>
  pull?.inventoryComplete === true &&
  validPromotionWriterPaths(pull.changedPaths) &&
  pull.gateSha256 === slice.gateSha256 &&
  pull.admissionSha256 === slice.admissionSha256;

function hasExactApproval(owner, slice, pull) {
  const marker = approvalMarker(slice, pull.headSha, pull.headTree);
  const matching = pull.reviews?.filter(
    review =>
      review.state === 'COMMENTED' &&
      review.body === marker &&
      review.commitId === pull.headSha &&
      review.user?.login === owner.login &&
      review.user?.id === owner.id
  );
  return matching?.length === 1;
}

function validateLivePullStates(facts) {
  const product = facts.product;
  const promotion = facts.promotion;
  if (
    product &&
    (!['OPEN', 'CLOSED'].includes(product.state) || typeof product.merged !== 'boolean')
  )
    return failAuthority('product_state_malformed');
  if (
    promotion &&
    (!['OPEN', 'CLOSED'].includes(promotion.state) || typeof promotion.merged !== 'boolean')
  )
    return failAuthority('promotion_state_malformed');
  if (product?.state === 'CLOSED' && product.merged === false) {
    return abandonAuthority('product_closed_unmerged');
  }
  if (promotion?.state === 'CLOSED' && promotion.merged === false) {
    return abandonAuthority('promotion_closed_unmerged');
  }
  return null;
}

function resolveMergedProduct(slice, facts, promotionMain) {
  const product = facts.product;
  const exact =
    product.state === 'CLOSED' &&
    product.baseSha === promotionMain &&
    product.headRef === slice.expectedProductBranch &&
    [product.headSha, product.headTree, product.mergeSha].every(sha => SHA40.test(sha)) &&
    product.mergeSha === facts.protectedMainSha &&
    same(product.mergeParents, [promotionMain]) &&
    product.mergeTree === product.headTree &&
    writerSubset(product.changedPaths, slice);
  if (!exact)
    return failAuthority('foreign_main_advance', {
      closeoutAuthorized: true,
      failureCloseoutRequired: true,
    });
  return authorityState('consumed_on_merge', 'intended_product_merge', {
    closeoutAuthorized: true,
    mergeSha: product.mergeSha,
  });
}

function resolveOpenProduct(slice, facts, promotionMain) {
  const product = facts.product;
  if (!writerSubset(product.changedPaths, slice)) {
    return failAuthority('product_writer_map_mismatch', {
      closeoutAuthorized: true,
      failureCloseoutRequired: true,
    });
  }
  const local = facts.local ?? {};
  const exact =
    product.state === 'OPEN' &&
    product.baseSha === promotionMain &&
    product.headRef === slice.expectedProductBranch &&
    SHA40.test(product.headSha) &&
    local.headSha === product.headSha &&
    local.forkPointSha === promotionMain &&
    ['', slice.expectedProductBranch].includes(local.branch) &&
    writerSubset(local.changedPaths, slice);
  return exact
    ? authorityState('active_implementation', 'exact_product_pr', {
        runtimeAuthorized: true,
        activeSlice: slice.sliceId,
        approvedHeadSha: product.headSha,
      })
    : failAuthority('product_pr_identity_mismatch');
}

function resolveLocalContinuation(slice, facts, promotionMain) {
  const local = facts.local ?? {};
  if (local.branch === 'main' && local.headSha === promotionMain) {
    return authorityState('awaiting_product_branch', 'exact_promotion_main', {
      activeSlice: slice.sliceId,
      approvedHeadSha: null,
    });
  }
  if (local.branch !== slice.expectedProductBranch)
    return failAuthority('wrong_continuation_branch');
  if (local.forkPointSha !== promotionMain) return failAuthority('wrong_product_fork');
  if (!writerSubset(local.changedPaths, slice)) {
    return failAuthority('product_writer_map_mismatch');
  }
  return authorityState('active_implementation', 'exact_product_branch', {
    runtimeAuthorized: true,
    activeSlice: slice.sliceId,
    approvedHeadSha: null,
  });
}

export function resolveAuthority(projectionInput, facts = {}) {
  let projection;
  try {
    projection = validateProjection(projectionInput);
  } catch (error) {
    return failAuthority('projection_invalid', { error: error.message });
  }
  if (!projection.activeSlice) return authorityState('inactive', 'no_active_slice');
  const earlyState = validateLivePullStates(facts);
  if (earlyState) return earlyState;
  const slice = projection.activeSlice;
  if (!exactPromotion(slice, facts.promotion)) return failAuthority('promotion_identity_mismatch');
  if (!exactPromotionScope(slice, facts.promotion))
    return failAuthority('promotion_scope_mismatch');
  if (!hasExactApproval(projection.owner, slice, facts.promotion)) {
    return failAuthority('promotion_approval_missing');
  }
  if (facts.product && facts.product.inventoryComplete !== true)
    return failAuthority('product_inventory_incomplete', {
      closeoutAuthorized: true,
      failureCloseoutRequired: true,
    });
  const promotionMain = facts.promotion.mergeSha;
  if (facts.product?.merged === true) return resolveMergedProduct(slice, facts, promotionMain);
  if (facts.protectedMainSha !== promotionMain)
    return failAuthority('foreign_main_advance', {
      closeoutAuthorized: true,
      failureCloseoutRequired: true,
    });
  return facts.product
    ? resolveOpenProduct(slice, facts, promotionMain)
    : resolveLocalContinuation(slice, facts, promotionMain);
}
