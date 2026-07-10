import { failure, isIsoDate, isRecord } from './storage-results.mjs';

const ID = /^rec_[a-f0-9]{24}$/;
const SEVERITIES = new Set(['none', 'low', 'medium', 'high']);
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
  if (!ID.test(receipt.receiptId) || !Number.isInteger(receipt.receiptVersion)) {
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
  if (receipt.receiptVersion > 1) {
    const correctionFields = [
      'previousReceiptId',
      'correctionItemId',
      'correctionReason',
      'correctionImpact',
    ];
    if (correctionFields.some(field => typeof receipt[field] !== 'string' || !receipt[field])) {
      return failure('invalid_data', 'Correction metadata is incomplete.');
    }
  }
  return { ok: true, value: receipt };
}

export function matchesMetadata(receipt, metadata) {
  const fields = ['packetId', 'assignmentId', 'reviewerFixtureId', 'reviewerRole', 'packetRole'];
  return isRecord(metadata) && fields.every(field => metadata[field] === receipt[field]);
}
