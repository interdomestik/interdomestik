import { buildReceipt, verifyReceipt } from '../../public/src/state/receipt-builder.mjs';
import { serverReceiptInput, validateReceiptJudgments } from './receipt-envelope.mjs';

const INPUT_KEYS = ['assignmentId', 'legacyReceipt', 'migrationConfirmed'];
const IDENTITY_FIELDS = [
  'assignmentId',
  'packetId',
  'packetVersion',
  'reviewerFixtureId',
  'reviewerDisplayName',
  'reviewerRole',
  'packetRole',
];
const compare = (left, right) => left.localeCompare(right, 'en');

export const ACCEPTED_LEGACY_RECEIPTS = new Map([
  ['rec_51f0d862d5f41cf26e3e60fc', 'assign_mob03a_part_a'],
  ['rec_1298f380aa840d71c2970a99', 'assign_mob03a_part_b'],
]);

function isRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function expectedIdentity(account, bundle) {
  return {
    assignmentId: bundle.assignment.id,
    packetId: bundle.packet.id,
    packetVersion: bundle.packet.version,
    reviewerFixtureId: account.fixtureId,
    reviewerDisplayName: account.displayName,
    reviewerRole: account.role,
    packetRole: bundle.packet.reviewerRole,
  };
}

function isMigrationInput(value) {
  return (
    isRecord(value) &&
    Object.keys(value).sort(compare).join(',') === INPUT_KEYS.join(',') &&
    typeof value.assignmentId === 'string' &&
    value.migrationConfirmed === true &&
    isRecord(value.legacyReceipt)
  );
}

export async function buildServerMigration(
  account,
  bundle,
  submission,
  { now, acceptedLegacyReceipts = ACCEPTED_LEGACY_RECEIPTS }
) {
  if (!isMigrationInput(submission) || submission.assignmentId !== bundle.assignment.id) {
    throw new TypeError('Invalid legacy receipt migration request.');
  }
  const legacy = submission.legacyReceipt;
  if (
    acceptedLegacyReceipts.get(legacy.receiptId) !== bundle.assignment.id ||
    'attestation' in legacy ||
    'reviewerAccountId' in legacy ||
    'migration' in legacy ||
    legacy.receiptVersion !== 1
  ) {
    throw Object.assign(new TypeError('Legacy receipt is not accepted.'), {
      code: 'invalid_receipt',
    });
  }
  const verified = await verifyReceipt(legacy);
  const expected = expectedIdentity(account, bundle);
  if (!verified.ok || IDENTITY_FIELDS.some(field => legacy[field] !== expected[field])) {
    throw Object.assign(new TypeError('Legacy receipt identity is invalid.'), {
      code: 'invalid_receipt',
    });
  }
  validateReceiptJudgments(bundle, legacy);
  return buildReceipt(
    {
      ...serverReceiptInput(account, bundle, legacy),
      migration: {
        sourceReceiptId: legacy.receiptId,
        sourceReceiptVersion: legacy.receiptVersion,
        sourceSchemaVersion: legacy.schemaVersion,
        sourceSubmittedAt: legacy.submittedAt,
      },
    },
    { now }
  );
}
