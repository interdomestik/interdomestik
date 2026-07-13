import { buildReceipt } from '../../public/src/state/receipt-builder.mjs';
import { validatePacket } from '../../public/src/validation/packet.mjs';

const INITIAL_KEYS = ['assignmentId', 'decisions', 'safeEvidenceConfirmed', 'structuredResponses'];
const CORRECTION_KEYS = [
  'assignmentId',
  'correctionImpact',
  'correctionItemId',
  'correctionReason',
  'decisions',
  'previousReceipt',
  'safeEvidenceConfirmed',
  'structuredResponses',
];
const compareStrings = (left, right) => left.localeCompare(right, 'en');

function isRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

export function isInitialSubmission(value) {
  return (
    isRecord(value) &&
    Object.keys(value).sort(compareStrings).join(',') === INITIAL_KEYS.join(',') &&
    typeof value.assignmentId === 'string' &&
    isRecord(value.decisions) &&
    isRecord(value.structuredResponses) &&
    value.safeEvidenceConfirmed === true
  );
}

function validateJudgments(bundle, submission) {
  const itemIds = bundle.packet.itemIds;
  const exactPacketKeys = record => {
    const actual = Object.keys(record).sort(compareStrings);
    const expected = [...itemIds].sort(compareStrings);
    return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
  };
  if (!exactPacketKeys(submission.decisions) || !exactPacketKeys(submission.structuredResponses)) {
    throw new TypeError('Receipt judgments do not match the assigned packet.');
  }
  for (const item of bundle.packet.items) {
    const allowed = new Set((item.requiredResponses ?? []).map(descriptor => descriptor.key));
    if (Object.keys(submission.structuredResponses[item.id]).some(key => !allowed.has(key))) {
      throw new TypeError('Receipt responses contain unknown fields.');
    }
  }
  const combined = Object.fromEntries(
    Object.entries(submission.decisions).map(([itemId, decision]) => [
      itemId,
      { ...decision, responses: submission.structuredResponses[itemId] },
    ])
  );
  const validation = validatePacket(bundle.packet, combined, true);
  if (!validation.valid) throw new TypeError('Receipt judgments are incomplete.');
}

function receiptInput(account, bundle, submission) {
  return {
    schemaVersion: 1,
    packetId: bundle.packet.id,
    packetVersion: bundle.packet.version,
    assignmentId: bundle.assignment.id,
    reviewerAccountId: account.id,
    reviewerFixtureId: account.fixtureId,
    reviewerDisplayName: account.displayName,
    reviewerRole: account.role,
    packetRole: bundle.packet.reviewerRole,
    authorityDisclaimer: 'Console review evidence only; CA+DG remains runtime authority.',
    decisions: submission.decisions,
    structuredResponses: submission.structuredResponses,
  };
}

export async function buildServerReceipt(account, bundle, submission, { now }) {
  if (!isInitialSubmission(submission) || submission.assignmentId !== bundle.assignment.id) {
    throw new TypeError('Invalid receipt submission.');
  }
  validateJudgments(bundle, submission);
  return buildReceipt(receiptInput(account, bundle, submission), { now });
}

export async function buildServerCorrection(
  account,
  bundle,
  submission,
  unsignedPrevious,
  { now }
) {
  if (
    !isRecord(submission) ||
    Object.keys(submission).sort(compareStrings).join(',') !== CORRECTION_KEYS.join(',') ||
    submission.assignmentId !== bundle.assignment.id ||
    ['correctionItemId', 'correctionReason', 'correctionImpact'].some(
      key => typeof submission[key] !== 'string' || !submission[key].trim()
    ) ||
    !bundle.packet.itemIds.includes(submission.correctionItemId)
  ) throw new TypeError('Invalid receipt correction.');
  validateJudgments(bundle, submission);
  return buildReceipt(
    {
      ...receiptInput(account, bundle, submission),
      previousReceipt: unsignedPrevious,
      correctionItemId: submission.correctionItemId,
      correctionReason: submission.correctionReason,
      correctionImpact: submission.correctionImpact,
    },
    { now }
  );
}
