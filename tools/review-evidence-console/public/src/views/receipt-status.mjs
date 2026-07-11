const IDENTITY_FIELDS = [
  'assignmentId',
  'reviewerFixtureId',
  'reviewerRole',
  'packetId',
  'packetRole',
];

function matchesIdentity(receipt, identity) {
  return IDENTITY_FIELDS.every(field => receipt?.[field] === identity?.[field]);
}

function matchesVersion(receipt, identity, packetVersion) {
  return matchesIdentity(receipt, identity) && receipt.packetVersion === packetVersion;
}

function hasValidLineage(receipt, identity, packetVersion, byId) {
  const visited = new Set();
  let current = receipt;
  while (current) {
    if (visited.has(current.receiptId) || !matchesVersion(current, identity, packetVersion)) {
      return false;
    }
    visited.add(current.receiptId);
    if (current.previousReceiptId === undefined) return true;
    current = byId.get(current.previousReceiptId);
  }
  return false;
}

function compareReceipts(left, right) {
  const byTime = left.submittedAt.localeCompare(right.submittedAt);
  return byTime || left.receiptId.localeCompare(right.receiptId);
}

function isOlderVersion(candidate, current) {
  const pattern = /^\d+(?:\.\d+)*$/;
  if (typeof candidate !== 'string' || typeof current !== 'string') return false;
  if (!pattern.test(candidate) || !pattern.test(current)) return false;
  const candidateParts = candidate.split('.').map(BigInt);
  const currentParts = current.split('.').map(BigInt);
  const length = Math.max(candidateParts.length, currentParts.length);
  for (let index = 0; index < length; index += 1) {
    const left = candidateParts[index] ?? 0n;
    const right = currentParts[index] ?? 0n;
    if (left !== right) return left < right;
  }
  return false;
}

export function receiptStatus(receipts, identity) {
  const evidence = Array.isArray(receipts) ? receipts : [];
  const byId = new Map(evidence.map(receipt => [receipt.receiptId, receipt]));
  const current = evidence
    .filter(receipt => matchesVersion(receipt, identity, identity.packetVersion))
    .filter(receipt => hasValidLineage(receipt, identity, identity.packetVersion, byId))
    .reduce(
      (latest, receipt) => (!latest || compareReceipts(receipt, latest) > 0 ? receipt : latest),
      null
    );

  if (current) {
    return {
      submissionStatus: 'submitted',
      receiptId: current.receiptId,
      submittedAt: current.submittedAt,
      packetVersion: current.packetVersion,
    };
  }
  return {
    submissionStatus: evidence.some(
      receipt =>
        matchesIdentity(receipt, identity) &&
        isOlderVersion(receipt.packetVersion, identity.packetVersion) &&
        hasValidLineage(receipt, identity, receipt.packetVersion, byId)
    )
      ? 'review_required'
      : null,
  };
}
