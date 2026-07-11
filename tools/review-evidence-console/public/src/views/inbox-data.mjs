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
  let receiptLists;
  const receiptListsByPacket = new Map();
  const listReceipts = packetId => {
    if (!receiptListsByPacket.has(packetId)) {
      receiptListsByPacket.set(
        packetId,
        Promise.resolve().then(() => receiptStore.list(packetId))
      );
    }
    return receiptListsByPacket.get(packetId);
  };
  try {
    receiptLists = await Promise.all(bundles.map(bundle => listReceipts(bundle.value.packet.id)));
  } catch {
    return {
      ok: false,
      code: 'unavailable',
      message: 'Statusi i dorëzimit nuk është i disponueshëm.',
    };
  }
  const receiptFailure = receiptLists.find(result => !result.ok);
  if (receiptFailure) return receiptFailure;
  rows = rows.map((row, index) => ({
    ...row,
    ...receiptStatus(receiptLists[index].value, receiptIdentity(bundles[index].value)),
  }));
  if (rows.some(row => row.submissionStatus === 'submitted')) {
    const nextIndex = rows.findIndex(row => row.submissionStatus !== 'submitted');
    if (nextIndex >= 0) rows[nextIndex] = { ...rows[nextIndex], nextAction: true };
  }
  return { ok: true, value: rows };
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
