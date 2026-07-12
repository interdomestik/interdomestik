import { importedReceiptMatchesPacket } from '../validation/receipt-packet.mjs';
import { receiptStatus } from './receipt-status.mjs';

const PROGRESS = Object.freeze({
  not_started: 'Nuk ka filluar',
  in_progress: 'Në progres — hap paketën për detaje',
  ready: 'Gati për dorëzim',
  submitted: 'Dërguar',
});

export function progressCopy(status) {
  return PROGRESS[status] ?? 'Status i panjohur';
}

export async function loadInboxRows(repository, reviewerId, receiptStore) {
  const assignments = await repository.listAssignments(reviewerId);
  if (!assignments.ok) return assignments;
  const bundles = await Promise.all(
    assignments.value.map(assignment => repository.loadAssignmentBundle(assignment.id))
  );
  const failed = bundles.find(bundle => !bundle.ok);
  if (failed) return failed;
  let rows = bundles.map((bundle, index) => {
    const expected = assignments.value[index];
    return bundleMatches(bundle.value, expected, reviewerId) ? toInboxRow(bundle.value) : null;
  });
  if (rows.some(row => !row)) {
    return {
      ok: false,
      code: 'invalid_data',
      message: 'Identiteti i paketës së detyrës është jokonsistent.',
    };
  }
  if (!receiptStore) return { ok: true, value: rows };
  let receiptBatch;
  try {
    receiptBatch = await receiptStore.listAll();
  } catch {
    return {
      ok: false,
      code: 'unavailable',
      message: 'Statusi i dorëzimit nuk është i disponueshëm.',
    };
  }
  if (!receiptBatch.ok) return receiptBatch;
  const receiptsByPacket = groupByPacket(receiptBatch.value);
  rows = rows.map((row, index) => ({
    ...row,
    ...receiptStatus(
      matchingPacketReceipts(receiptsByPacket, bundles[index].value.packet),
      receiptIdentity(bundles[index].value)
    ),
  }));
  for (const row of rows) {
    if (row.submissionStatus !== 'submitted' || !row.continuesWithAssignmentId) continue;
    const nextIndex = rows.findIndex(candidate => candidate.id === row.continuesWithAssignmentId);
    if (nextIndex >= 0 && rows[nextIndex].submissionStatus !== 'submitted') {
      rows[nextIndex] = { ...rows[nextIndex], nextAction: true };
    }
  }
  return { ok: true, value: rows };
}

function matchingPacketReceipts(receiptsByPacket, packet) {
  const receipts = receiptsByPacket.get(packet.id) ?? [];
  return receipts.filter(receipt => importedReceiptMatchesPacket(receipt, packet, true));
}

function groupByPacket(receipts) {
  const grouped = new Map();
  for (const receipt of receipts) {
    if (!grouped.has(receipt.packetId)) grouped.set(receipt.packetId, []);
    grouped.get(receipt.packetId).push(receipt);
  }
  return grouped;
}

function receiptIdentity({ assignment, reviewer, packet }) {
  return {
    assignmentId: assignment.id,
    reviewerFixtureId: reviewer.id,
    reviewerRole: reviewer.role,
    packetId: packet.id,
    packetRole: packet.reviewerRole,
    packetVersion: packet.version,
  };
}

function bundleMatches({ assignment, reviewer, packet }, expected, reviewerId) {
  return (
    assignment.id === expected.id &&
    assignment.reviewerFixtureId === reviewerId &&
    reviewer.id === reviewerId &&
    assignment.reviewerRole === reviewer.role &&
    assignment.packetId === packet.id &&
    assignment.reviewerRole === packet.reviewerRole
  );
}

function toInboxRow({ assignment, packet }) {
  return {
    ...assignment,
    firstItemId: packet.itemIds[0],
    title: assignment.titleSq,
    purpose: assignment.purposeSq,
    progress: progressCopy(assignment.status),
  };
}
