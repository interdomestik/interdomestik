const IDENTITY_FIELDS = [
  'assignmentId',
  'reviewerFixtureId',
  'reviewerRole',
  'packetId',
  'packetRole',
];
const MAX_VERSION_SEGMENTS = 16;
const MAX_VERSION_SEGMENT_LENGTH = 64;

function matchesIdentity(receipt, identity) {
  return IDENTITY_FIELDS.every(field => receipt?.[field] === identity?.[field]);
}

function matchesVersion(receipt, identity, packetVersion) {
  return matchesIdentity(receipt, identity) && receipt.packetVersion === packetVersion;
}

function lineageValidator(identity, byId) {
  const cache = new Map();
  function validate(receipt, packetVersion) {
    const path = [];
    const visiting = new Set();
    let current = receipt;
    let valid = false;
    while (current) {
      const key = `${packetVersion}\0${current.receiptId}`;
      if (cache.has(key)) {
        valid = cache.get(key);
        break;
      }
      if (visiting.has(key) || !matchesVersion(current, identity, packetVersion)) break;
      visiting.add(key);
      path.push(key);
      if (current.previousReceiptId === undefined) {
        valid = true;
        break;
      }
      current = byId.get(current.previousReceiptId);
    }
    path.forEach(key => cache.set(key, valid));
    return valid;
  }
  return validate;
}

function compareReceipts(left, right) {
  const byTime = left.submittedAt.localeCompare(right.submittedAt);
  return byTime || left.receiptId.localeCompare(right.receiptId);
}

function versionParts(value) {
  const maxLength = MAX_VERSION_SEGMENTS * (MAX_VERSION_SEGMENT_LENGTH + 1) - 1;
  if (typeof value !== 'string' || value.length > maxLength) return null;
  const parts = value.split('.');
  if (parts.length > MAX_VERSION_SEGMENTS) return null;
  if (parts.some(part => !/^\d+$/.test(part) || part.length > MAX_VERSION_SEGMENT_LENGTH)) {
    return null;
  }
  return parts.map(part => part.replace(/^0+(?=\d)/, ''));
}

function isOlderVersion(candidate, current) {
  const candidateParts = versionParts(candidate);
  const currentParts = versionParts(current);
  if (!candidateParts || !currentParts) return false;
  const length = Math.max(candidateParts.length, currentParts.length);
  for (let index = 0; index < length; index += 1) {
    const left = candidateParts[index] ?? '0';
    const right = currentParts[index] ?? '0';
    if (left.length !== right.length) return left.length < right.length;
    if (left !== right) return left < right;
  }
  return false;
}

export function receiptStatus(receipts, identity) {
  const evidence = Array.isArray(receipts) ? receipts : [];
  const byId = new Map(evidence.map(receipt => [receipt.receiptId, receipt]));
  const hasValidLineage = lineageValidator(identity, byId);
  const current = evidence
    .filter(receipt => matchesVersion(receipt, identity, identity.packetVersion))
    .filter(receipt => hasValidLineage(receipt, identity.packetVersion))
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
        hasValidLineage(receipt, receipt.packetVersion)
    )
      ? 'review_required'
      : null,
  };
}
