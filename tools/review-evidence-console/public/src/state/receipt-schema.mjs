import { isRecord } from './storage-results.mjs';
export { validateReceipt } from './receipt-validation.mjs';

export function matchesMetadata(receipt, metadata) {
  const fields = [
    'packetId',
    'packetVersion',
    'assignmentId',
    'reviewerFixtureId',
    'reviewerRole',
    'packetRole',
  ];
  return isRecord(metadata) && fields.every(field => metadata[field] === receipt[field]);
}
