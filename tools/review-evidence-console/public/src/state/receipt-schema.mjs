import { aggregateRisk } from './risk-summary.mjs';
import { failure, isIsoDate, isRecord } from './storage-results.mjs';

const ID = /^rec_[a-f0-9]{24}$/;
const SEVERITIES = new Set(['none', 'low', 'medium', 'high']);
const DECISION_SEVERITIES = new Set(['low', 'medium', 'high']);
const DECISIONS = new Set(['approve', 'change', 'block']);
const CORRECTION_FIELDS = [
  'previousReceiptId',
  'correctionItemId',
  'correctionReason',
  'correctionImpact',
];
const requiredStrings = [
  'packetId',
  'packetVersion',
  'assignmentId',
  'reviewerFixtureId',
  'reviewerDisplayName',
  'reviewerRole',
  'packetRole',
  'authorityDisclaimer',
];

export function validateReceipt(receipt, schemaVersion) {
  if (!isRecord(receipt)) return failure('invalid_data', 'Receipt must be an object.');
  if (receipt.schemaVersion !== schemaVersion) {
    return failure('schema_mismatch', 'Receipt schema is incompatible.');
  }
  if (
    !ID.test(receipt.receiptId) ||
    !Number.isInteger(receipt.receiptVersion) ||
    receipt.receiptVersion < 1
  ) {
    return failure('invalid_data', 'Receipt identity is invalid.');
  }
  if (requiredStrings.some(field => typeof receipt[field] !== 'string' || !receipt[field])) {
    return failure('invalid_data', 'Receipt metadata is incomplete.');
  }
  if (!isIsoDate(receipt.submittedAt) || !isRecord(receipt.decisions)) {
    return failure('invalid_data', 'Receipt content is incomplete.');
  }
  if (!isRecord(receipt.structuredResponses) || !isRecord(receipt.riskSummary)) {
    return failure('invalid_data', 'Receipt content is incomplete.');
  }
  const { severity, categories } = receipt.riskSummary;
  if (
    !SEVERITIES.has(severity) ||
    !Array.isArray(categories) ||
    categories.some(value => typeof value !== 'string')
  ) {
    return failure('invalid_data', 'Receipt risk summary is invalid.');
  }
  for (const decision of Object.values(receipt.decisions)) {
    if (
      !isRecord(decision) ||
      !DECISIONS.has(decision.decision) ||
      !DECISION_SEVERITIES.has(decision.severity) ||
      typeof decision.riskCategory !== 'string' ||
      decision.riskCategory.trim() === ''
    ) {
      return failure('invalid_data', 'Receipt decision content is invalid.');
    }
  }
  if (Object.values(receipt.structuredResponses).some(value => !isRecord(value))) {
    return failure('invalid_data', 'Receipt structured responses are invalid.');
  }
  const expectedRisk = aggregateRisk(Object.values(receipt.decisions));
  const riskKeys = Object.keys(receipt.riskSummary).sort();
  if (
    riskKeys.join(',') !== 'categories,severity' ||
    receipt.riskSummary.severity !== expectedRisk.severity ||
    receipt.riskSummary.categories.length !== expectedRisk.categories.length ||
    receipt.riskSummary.categories.some((value, index) => value !== expectedRisk.categories[index])
  ) {
    return failure('invalid_data', 'Receipt risk summary does not match its decisions.');
  }
  if (receipt.receiptVersion === 1 && CORRECTION_FIELDS.some(field => field in receipt)) {
    return failure('invalid_data', 'Initial receipts cannot contain correction metadata.');
  }
  if (receipt.receiptVersion > 1) {
    if (
      !ID.test(receipt.previousReceiptId) ||
      CORRECTION_FIELDS.slice(1).some(
        field => typeof receipt[field] !== 'string' || receipt[field].trim() === ''
      )
    ) {
      return failure('invalid_data', 'Correction metadata is incomplete.');
    }
    if (receipt.previousReceiptId === receipt.receiptId) {
      return failure('invalid_data', 'Correction receipt cannot link to itself.');
    }
  }
  return { ok: true, value: receipt };
}

export function matchesMetadata(receipt, metadata) {
  const fields = ['packetId', 'assignmentId', 'reviewerFixtureId', 'reviewerRole', 'packetRole'];
  return isRecord(metadata) && fields.every(field => metadata[field] === receipt[field]);
}
