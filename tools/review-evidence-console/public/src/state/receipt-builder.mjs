import { canonicalStringify } from './canonical-json.mjs';
import { validateReceipt } from './receipt-schema.mjs';
import { failure } from './storage-results.mjs';

const RANK = { none: 0, low: 1, medium: 2, high: 3 };

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

export function aggregateRisk(decisions) {
  let severity = 'none';
  const categories = new Set();
  for (const decision of decisions) {
    const candidate = decision?.severity;
    if (candidate in RANK && RANK[candidate] > RANK[severity]) severity = candidate;
  }
  for (const decision of decisions) {
    if (decision?.severity === severity && decision.riskCategory)
      categories.add(decision.riskCategory);
  }
  return { severity, categories: [...categories].sort() };
}

export async function buildReceipt(input, { now = () => new Date().toISOString() } = {}) {
  const submittedAt = input.submittedAt ?? now();
  const previous = input.previousReceipt;
  if (previous) {
    const fields = ['correctionItemId', 'correctionReason', 'correctionImpact'];
    if (fields.some(field => typeof input[field] !== 'string' || !input[field])) {
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
    decisions: input.decisions,
    structuredResponses: input.structuredResponses,
    submittedAt,
    receiptVersion: previous ? previous.receiptVersion + 1 : 1,
    riskSummary: aggregateRisk(Object.values(input.decisions ?? {})),
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
  const expectedId = await receiptIdFor(payload);
  if (receiptId !== expectedId) return failure('hash_mismatch', 'Receipt hash does not match.');
  return { ok: true, value: receipt };
}
