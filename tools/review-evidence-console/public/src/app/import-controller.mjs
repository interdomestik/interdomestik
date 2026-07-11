import { readReceiptFile } from './receipt-io.mjs';

export async function importReceipt({ assignmentId, file, repository, receiptStore }) {
  const bundle = await repository.loadAssignmentBundle(assignmentId);
  const read = await readReceiptFile(file);
  if (!bundle.ok) return bundle;
  if (!read.ok) return read;
  const metadata = {
    packetId: bundle.value.packet.id,
    packetVersion: bundle.value.packet.version,
    assignmentId: bundle.value.assignment.id,
    reviewerFixtureId: bundle.value.reviewer.id,
    reviewerRole: bundle.value.reviewer.role,
    packetRole: bundle.value.packet.reviewerRole,
  };
  return receiptStore.import(read.value, metadata);
}
