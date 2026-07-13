import { verifyReceipt } from '../state/receipt-builder.mjs';
import { matchesMetadata } from '../state/receipt-schema.mjs';
import { failure } from '../state/storage-results.mjs';
import { importedReceiptMatchesPacket } from '../validation/receipt-packet.mjs';

function metadataFor(bundle) {
  return {
    packetId: bundle.packet.id,
    packetVersion: bundle.packet.version,
    assignmentId: bundle.assignment.id,
    reviewerFixtureId: bundle.reviewer.id,
    reviewerRole: bundle.reviewer.role,
    packetRole: bundle.packet.reviewerRole,
  };
}

export async function prepareReceiptImport(text, bundle) {
  let receipt;
  try {
    receipt = JSON.parse(text);
  } catch {
    return failure('invalid_data', 'Importi i vërtetimit nuk është JSON i vlefshëm.');
  }
  if (receipt?.attestation) return { ok: true, kind: 'signed', value: receipt };
  const verified = await verifyReceipt(receipt);
  if (
    !verified.ok ||
    !matchesMetadata(receipt, metadataFor(bundle)) ||
    receipt.reviewerDisplayName !== bundle.reviewer.displayName ||
    !importedReceiptMatchesPacket(receipt, bundle.packet, true)
  ) {
    return failure('invalid_data', 'Vërtetimi i mëparshëm nuk përputhet me këtë detyrë.');
  }
  return { ok: true, kind: 'legacy', value: receipt };
}

export function migrationSummary(receipt) {
  return Object.freeze({
    sourceReceiptId: receipt.receiptId,
    sourceSubmittedAt: receipt.submittedAt,
    packetId: receipt.packetId,
  });
}
