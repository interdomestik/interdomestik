import { canonicalStringify } from './canonical-json.mjs';
import { validateReceipt } from './receipt-schema.mjs';
import { aggregateRisk } from './risk-summary.mjs';
import { failure } from './storage-results.mjs';

export { aggregateRisk } from './risk-summary.mjs';

const LINEAGE_FIELDS = [
  'schemaVersion',
  'packetId',
  'packetVersion',
  'assignmentId',
  'reviewerFixtureId',
  'reviewerRole',
  'packetRole',
  'reviewerDisplayName',
  'authorityDisclaimer',
];
const DECISION_FIELDS = [
  'decision',
  'concreteAnswer',
  'reason',
  'evidenceRef',
  'verifiedAt',
  'riskCategory',
  'severity',
];
const SIDECAR_FIELDS = new Set([
  'contextualNoteState',
  'retainedSidecar',
  'statuses',
  'status',
  'suggestedReview',
  'suggestionVersion',
  'useSessionDateFor',
]);

function canonicalDecision(decision = {}) {
  const canonical = Object.fromEntries(
    DECISION_FIELDS.filter(field => decision[field] !== undefined).map(field => [
      field,
      decision[field],
    ])
  );
  const requestedChange = decision.requestedChange?.trim();
  if (['change', 'block'].includes(decision.decision) && requestedChange) {
    canonical.requestedChange = requestedChange;
  }
  return canonical;
}

function canonicalDecisions(decisions = {}) {
  return Object.fromEntries(
    Object.entries(decisions).map(([itemId, decision]) => [itemId, canonicalDecision(decision)])
  );
}

function pruneSidecars(value) {
  if (Array.isArray(value)) return value.map(pruneSidecars);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !SIDECAR_FIELDS.has(key))
      .map(([key, nested]) => [key, pruneSidecars(nested)])
  );
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
  }
  return value;
}

async function receiptIdFor(payload) {
  const bytes = new TextEncoder().encode(canonicalStringify(payload));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  const hex = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
  return `rec_${hex.slice(0, 24)}`;
}

export async function buildReceipt(input, { now = () => new Date().toISOString() } = {}) {
  const submittedAt = input.submittedAt ?? now();
  const decisions = canonicalDecisions(input.decisions);
  const previous = input.previousReceipt;
  if (previous) {
    const previousValidation = validateReceipt(previous, input.schemaVersion);
    const previousVerification = previousValidation.ok
      ? await verifyReceipt(previous)
      : previousValidation;
    const lineageMatches = LINEAGE_FIELDS.every(field => previous[field] === input[field]);
    if (!previousVerification.ok || !lineageMatches) {
      throw new TypeError('Previous receipt identity, version, schema, or content is invalid.');
    }
    const fields = ['correctionItemId', 'correctionReason', 'correctionImpact'];
    if (fields.some(field => typeof input[field] !== 'string' || input[field].trim() === '')) {
      throw new TypeError('Correction item, reason, and impact are required.');
    }
  }
  const payload = {
    schemaVersion: input.schemaVersion,
    packetId: input.packetId,
    packetVersion: input.packetVersion,
    assignmentId: input.assignmentId,
    reviewerFixtureId: input.reviewerFixtureId,
    reviewerDisplayName: input.reviewerDisplayName,
    reviewerRole: input.reviewerRole,
    packetRole: input.packetRole,
    authorityDisclaimer: input.authorityDisclaimer,
    decisions,
    structuredResponses: pruneSidecars(input.structuredResponses),
    submittedAt,
    receiptVersion: previous ? previous.receiptVersion + 1 : 1,
    riskSummary: aggregateRisk(Object.values(decisions)),
    ...(previous
      ? {
          previousReceiptId: previous.receiptId,
          correctionItemId: input.correctionItemId,
          correctionReason: input.correctionReason,
          correctionImpact: input.correctionImpact,
        }
      : {}),
  };
  const canonicalPayload = JSON.parse(canonicalStringify(payload));
  const receiptId = await receiptIdFor(canonicalPayload);
  return deepFreeze({ receiptId, ...canonicalPayload });
}

export async function verifyReceipt(receipt) {
  const validation = validateReceipt(receipt, receipt?.schemaVersion);
  if (!validation.ok) return validation;
  const { receiptId, ...payload } = receipt;
  try {
    canonicalStringify(payload);
  } catch {
    return failure('invalid_data', 'Receipt contains non-canonical JSON values.');
  }
  let expectedId;
  try {
    expectedId = await receiptIdFor(payload);
  } catch {
    return failure('unavailable', 'Receipt verification is unavailable.');
  }
  if (receiptId !== expectedId) return failure('hash_mismatch', 'Receipt hash does not match.');
  return { ok: true, value: receipt };
}
