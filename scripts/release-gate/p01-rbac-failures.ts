function collectRbacFailures(input) {
  const { account, portal, route, matrix, current, runCtx, memberDriftSignatureAdded } = input;
  const failures = [];
  let driftRecorded = memberDriftSignatureAdded;

  if (
    account === 'member' &&
    portal === 'member' &&
    current.member === true &&
    (current.agent === true || current.staff === true || current.admin === true) &&
    !driftRecorded
  ) {
    driftRecorded = true;
    failures.push(
      `P0.1_MISCONFIG_MEMBER_ROLE_DRIFT account=member route=/${runCtx.locale}${route} visible=${JSON.stringify(current)}`
    );
  }

  if (portal === matrix.canonical && current[matrix.canonical] !== true) {
    failures.push(
      `P0.1_RBAC_CANONICAL_MARKER_MISSING account=${account} route=/${runCtx.locale}${route} expected=${matrix.canonical} visible=${JSON.stringify(current)}`
    );
  }

  const unexpectedVisible = matrix.absentOnAllRoutes.filter(key => current[key] === true);
  if (unexpectedVisible.length > 0) {
    failures.push(
      `P0.1_RBAC_MARKER_MISMATCH account=${account} route=/${runCtx.locale}${route} must_absent=${unexpectedVisible.join(',')} visible=${JSON.stringify(current)}`
    );
  }

  return { driftRecorded, failures };
}

function isPositiveCanonicalNotFoundFailure(failure) {
  return (
    String(failure).startsWith('P0.1_RBAC_CANONICAL_MARKER_MISSING ') &&
    String(failure).includes('"notFound":true')
  );
}

function shouldRetryP01FreshContext(attempt) {
  return (
    attempt.positiveCanonicalNotFound &&
    attempt.failures.length > 0 &&
    attempt.failures.every(isPositiveCanonicalNotFoundFailure)
  );
}

module.exports = {
  collectRbacFailures,
  shouldRetryP01FreshContext,
};
