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

function matchesCurrent(receipt, identity) {
  return matchesIdentity(receipt, identity) && receipt.packetVersion === identity.packetVersion;
}

function hasValidLineage(receipt, identity, byId) {
  const visited = new Set();
  let current = receipt;
  while (current) {
    if (visited.has(current.receiptId) || !matchesCurrent(current, identity)) return false;
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

export function receiptStatus(receipts, identity) {
  const evidence = Array.isArray(receipts) ? receipts : [];
  const byId = new Map(evidence.map(receipt => [receipt.receiptId, receipt]));
  const current = evidence
    .filter(receipt => matchesCurrent(receipt, identity))
    .filter(receipt => hasValidLineage(receipt, identity, byId))
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
        matchesIdentity(receipt, identity) && receipt.packetVersion !== identity.packetVersion
    )
      ? 'review_required'
      : null,
  };
}
