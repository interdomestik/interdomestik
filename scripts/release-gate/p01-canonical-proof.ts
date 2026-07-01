function positiveExpectedMarker(expected) {
  const positiveMarkers = Object.entries(expected || {})
    .filter(([, value]) => value === true)
    .map(([key]) => key);
  return positiveMarkers.length === 1 ? positiveMarkers[0] : null;
}

function ensureP01CanonicalProofMap(runCtx) {
  if (!runCtx.p01CanonicalProofByAccount) {
    runCtx.p01CanonicalProofByAccount = new Map();
  }
  return runCtx.p01CanonicalProofByAccount;
}

function accountKeyForRolePanelTarget(targetUrl) {
  const target = String(targetUrl || '');
  const match = target.match(/\/admin\/users\/([^/?#]+)/);
  if (!match) return null;

  const userId = decodeURIComponent(match[1]);
  if (userId === 'golden_ks_agent_a1') return 'agent';
  if (userId === 'golden_ks_staff') return 'staff';
  if (userId === 'golden_ks_admin') return 'admin_ks';
  if (userId.startsWith('golden_ks_a_member_')) return 'member';
  return null;
}

function recordP01CanonicalProof(runCtx, accountKey, route, marker, observed) {
  if (!runCtx || !marker || observed?.[marker] !== true) return;
  ensureP01CanonicalProofMap(runCtx).set(accountKey, {
    marker,
    observed: { ...observed },
    route,
  });
}

function resolveP01CanonicalProof(runCtx, accountKey, route, expected) {
  const marker = positiveExpectedMarker(expected);
  if (!marker) return null;

  const proof = runCtx?.p01CanonicalProofByAccount?.get(accountKey);
  if (!proof || proof.route !== route || proof.marker !== marker) return null;
  if (proof.observed?.[marker] !== true) return null;

  return {
    expected,
    label: 'P0.1 canonical proof',
    mismatches: [],
    observed: { ...proof.observed },
    source: 'p01-proof',
    status: 'PASS',
  };
}

function invalidateP01ProofForRoleTarget(runCtx, targetUrl) {
  const accountKey = accountKeyForRolePanelTarget(targetUrl);
  if (!accountKey || !runCtx?.p01CanonicalProofByAccount) return null;
  const invalidated = runCtx.p01CanonicalProofByAccount.delete(accountKey);
  return invalidated ? accountKey : null;
}

module.exports = {
  accountKeyForRolePanelTarget,
  invalidateP01ProofForRoleTarget,
  recordP01CanonicalProof,
  resolveP01CanonicalProof,
};
