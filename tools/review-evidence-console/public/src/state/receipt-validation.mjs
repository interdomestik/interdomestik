import { aggregateRisk } from './risk-summary.mjs';
import {
  containsContextualMetadata,
  hasCanonicalDecisionKeys,
} from './receipt-canonicalization.mjs';
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
const REQUIRED_STRINGS = [
  'packetId',
  'packetVersion',
  'assignmentId',
  'reviewerFixtureId',
  'reviewerDisplayName',
  'reviewerRole',
  'packetRole',
  'authorityDisclaimer',
];
const MIGRATION_KEYS = [
  'sourceReceiptId',
  'sourceReceiptVersion',
  'sourceSchemaVersion',
  'sourceSubmittedAt',
];

function invalid(message) {
  return failure('invalid_data', message);
}

function validateIdentity(receipt, schemaVersion) {
  if (!isRecord(receipt)) return invalid('Vërtetimi duhet të jetë objekt.');
  if (containsContextualMetadata(receipt))
    return invalid('Vërtetimi përmban metadata sugjerimesh jo-kanonike.');
  if (receipt.schemaVersion !== schemaVersion)
    return failure('schema_mismatch', 'Skema e vërtetimit është e papajtueshme.');
  if (
    !ID.test(receipt.receiptId) ||
    !Number.isInteger(receipt.receiptVersion) ||
    receipt.receiptVersion < 1
  )
    return invalid('Identiteti i vërtetimit është i pavlefshëm.');
  if (REQUIRED_STRINGS.some(field => typeof receipt[field] !== 'string' || !receipt[field]))
    return invalid('Metadatat e vërtetimit janë të paplota.');
  return null;
}

function validateBody(receipt) {
  if (!isIsoDate(receipt.submittedAt) || !isRecord(receipt.decisions))
    return invalid('Përmbajtja e vërtetimit është e paplotë.');
  if (!isRecord(receipt.structuredResponses) || !isRecord(receipt.riskSummary))
    return invalid('Përmbajtja e vërtetimit është e paplotë.');
  const { severity, categories } = receipt.riskSummary;
  if (
    !SEVERITIES.has(severity) ||
    !Array.isArray(categories) ||
    categories.some(value => typeof value !== 'string')
  )
    return invalid('Përmbledhja e rrezikut e vërtetimit është e pavlefshme.');
  if (
    Object.values(receipt.decisions).some(
      decision =>
        !isRecord(decision) ||
        !hasCanonicalDecisionKeys(decision) ||
        !DECISIONS.has(decision.decision) ||
        !DECISION_SEVERITIES.has(decision.severity) ||
        typeof decision.riskCategory !== 'string' ||
        decision.riskCategory.trim() === ''
    )
  )
    return invalid('Përmbajtja e vendimit të vërtetimit është e pavlefshme.');
  if (Object.values(receipt.structuredResponses).some(value => !isRecord(value)))
    return invalid('Përgjigjet e strukturuara të vërtetimit janë të pavlefshme.');
  const expectedRisk = aggregateRisk(Object.values(receipt.decisions));
  const riskKeys = Object.keys(receipt.riskSummary).sort((left, right) =>
    left.localeCompare(right)
  );
  if (
    riskKeys.join(',') !== 'categories,severity' ||
    receipt.riskSummary.severity !== expectedRisk.severity ||
    receipt.riskSummary.categories.length !== expectedRisk.categories.length ||
    receipt.riskSummary.categories.some((value, index) => value !== expectedRisk.categories[index])
  )
    return invalid('Përmbledhja e rrezikut nuk përputhet me vendimet.');
  return null;
}

function validateCorrection(receipt) {
  if (receipt.receiptVersion === 1 && CORRECTION_FIELDS.some(field => field in receipt))
    return invalid('Vërtetimet fillestare nuk mund të kenë metadata korrigjimi.');
  if (receipt.receiptVersion > 1) {
    if (
      !ID.test(receipt.previousReceiptId) ||
      CORRECTION_FIELDS.slice(1).some(
        field => typeof receipt[field] !== 'string' || receipt[field].trim() === ''
      )
    )
      return invalid('Metadatat e korrigjimit janë të paplota.');
    if (receipt.previousReceiptId === receipt.receiptId)
      return invalid('Vërtetimi i korrigjimit nuk mund të lidhet me vetveten.');
  }
  return null;
}

function validateMigration(receipt) {
  if (receipt.migration === undefined) return null;
  const value = receipt.migration;
  const keys = isRecord(value) ? Object.keys(value) : [];
  const hasExactKeys =
    keys.length === MIGRATION_KEYS.length && MIGRATION_KEYS.every(key => keys.includes(key));
  if (
    !isRecord(value) ||
    !hasExactKeys ||
    !ID.test(value.sourceReceiptId) ||
    value.sourceReceiptId === receipt.receiptId ||
    !Number.isInteger(value.sourceReceiptVersion) ||
    value.sourceReceiptVersion < 1 ||
    !Number.isInteger(value.sourceSchemaVersion) ||
    value.sourceSchemaVersion < 1 ||
    !isIsoDate(value.sourceSubmittedAt)
  )
    return invalid('Gjurmët e migrimit janë të pavlefshme.');
  return null;
}

export function validateReceipt(receipt, schemaVersion) {
  const identityError = validateIdentity(receipt, schemaVersion);
  if (identityError) return identityError;
  const bodyError = validateBody(receipt);
  if (bodyError) return bodyError;
  const correctionError = validateCorrection(receipt);
  if (correctionError) return correctionError;
  const migrationError = validateMigration(receipt);
  if (migrationError) return migrationError;
  return { ok: true, value: receipt };
}
