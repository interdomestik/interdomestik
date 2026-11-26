import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';

const SHA256 = /^[a-f0-9]{64}$/u;
const ID = /^[1-9]\d{0,19}$/u;
const EVIDENCE_ID = /^[a-zA-Z0-9][a-zA-Z0-9./:_-]{0,127}$/u;
const MAX_RECEIPT_BYTES = 16_384;
const MAX_DRAIN_AGE = 30 * 60_000;

export const digest = bytes => createHash('sha256').update(bytes).digest('hex');

export function readObject(raw, label, limit = MAX_RECEIPT_BYTES) {
  if (typeof raw !== 'string' || !raw.trim() || Buffer.byteLength(raw) > limit)
    throw new Error(`${label}_MISSING_OR_SIZE`);
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error(`${label}_JSON_INVALID`);
  }
  if (!value || Object.getPrototypeOf(value) !== Object.prototype)
    throw new Error(`${label}_SHAPE_INVALID`);
  return value;
}

function exactKeys(object, keys) {
  return (
    object &&
    Object.getPrototypeOf(object) === Object.prototype &&
    Object.keys(object).length === keys.length &&
    keys.every(key => Object.hasOwn(object, key))
  );
}

function parseTimestamp(value) {
  const time = Date.parse(value);
  if (typeof value !== 'string' || !Number.isFinite(time) || new Date(time).toISOString() !== value)
    throw new Error('RECEIPT_TIMESTAMP_INVALID');
  return time;
}

export function verifyDrainReceipt(raw, { release, manifestSha256, invocation, now = Date.now() }) {
  const receipt = readObject(raw, 'RECEIPT');
  if (
    !exactKeys(receipt, ['version', 'manifestSha256', 'release', 'invocation', 'evidence']) ||
    receipt.version !== 1 ||
    !SHA256.test(manifestSha256) ||
    receipt.manifestSha256 !== manifestSha256 ||
    !isDeepStrictEqual(receipt.release, release) ||
    !isDeepStrictEqual(receipt.invocation, invocation)
  )
    throw new Error('RECEIPT_RELEASE_OR_INVOCATION_MISMATCH');

  const evidence = receipt.evidence;
  if (
    !exactKeys(evidence, [
      'id',
      'sha256',
      'writers',
      'fence',
      'outstandingWrites',
      'inFlightTransactions',
      'preparedTransactions',
      'observedAt',
      'expiresAt',
    ]) ||
    typeof evidence.id !== 'string' ||
    !EVIDENCE_ID.test(evidence.id) ||
    typeof evidence.sha256 !== 'string' ||
    !SHA256.test(evidence.sha256) ||
    typeof evidence.fence !== 'string' ||
    !EVIDENCE_ID.test(evidence.fence) ||
    evidence.outstandingWrites !== 0 ||
    evidence.inFlightTransactions !== 0 ||
    evidence.preparedTransactions !== 0
  )
    throw new Error('RECEIPT_DRAIN_INVALID');

  const writerKinds = ['webEndpoints', 'workers', 'schedulers', 'queues'];
  if (
    !exactKeys(evidence.writers, writerKinds) ||
    writerKinds.some(kind => {
      const items = evidence.writers[kind];
      return (
        !Array.isArray(items) ||
        items.length > 50 ||
        items.some(item => typeof item !== 'string' || !EVIDENCE_ID.test(item)) ||
        new Set(items).size !== items.length
      );
    })
  )
    throw new Error('RECEIPT_WRITER_INVENTORY_INVALID');

  const observedAt = parseTimestamp(evidence.observedAt);
  const expiresAt = parseTimestamp(evidence.expiresAt);
  if (observedAt > now || expiresAt <= now || expiresAt - observedAt > MAX_DRAIN_AGE)
    throw new Error('RECEIPT_EXPIRED_OR_NOT_YET_VALID');
  return {
    receiptSha256: digest(raw),
    drain: evidence,
    expiresAt,
  };
}

export function verifyGitHubApproval(reviews, { environment, reviewerIds, receiptSha256 }) {
  const ids = reviewerIds?.split(',') ?? [];
  if (!ids.length || ids.some(id => !ID.test(id)) || !SHA256.test(receiptSha256))
    throw new Error('REVIEW_AUTHORITY_INVALID');
  if (!Array.isArray(reviews)) throw new Error('REVIEW_HISTORY_INVALID');
  const matching = reviews.filter(
    review =>
      review?.comment === `release-drain sha256:${receiptSha256}` &&
      Array.isArray(review.environments) &&
      review.environments.some(item => item?.name === environment)
  );
  const [review] = matching;
  if (
    matching.length !== 1 ||
    review.state !== 'approved' ||
    review.user?.type !== 'User' ||
    !Number.isSafeInteger(review.user?.id) ||
    !ids.includes(String(review.user.id))
  )
    throw new Error('RECEIPT_APPROVAL_MISSING');
  if (!/^[a-zA-Z0-9][a-zA-Z0-9-]{0,38}$/u.test(review.user.login ?? ''))
    throw new Error('REVIEW_ACTOR_INVALID');
  return { operatorId: review.user.id, operatorLogin: review.user.login };
}
