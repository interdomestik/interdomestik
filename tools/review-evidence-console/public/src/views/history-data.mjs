function receiptMatchesBundle(receipt, bundle, accountId) {
  return (
    receipt.reviewerAccountId === accountId &&
    receipt.assignmentId === bundle.assignment.id &&
    receipt.packetId === bundle.packet.id &&
    receipt.reviewerFixtureId === bundle.reviewer.id &&
    receipt.reviewerRole === bundle.reviewer.role &&
    receipt.packetRole === bundle.packet.reviewerRole
  );
}

function unavailable(message) {
  return { ok: false, code: 'unavailable', message };
}

export async function loadHistoryRows(repository, receiptStore) {
  const profile = await repository.loadReviewerProfile();
  if (!profile.ok) return profile;
  if (typeof profile.value.accountId !== 'string' || !profile.value.accountId) {
    return unavailable('Identiteti i llogarisë nuk është i disponueshëm.');
  }
  const assignments = await repository.listAssignments();
  if (!assignments.ok) return assignments;
  const bundles = await Promise.all(
    assignments.value.map(assignment => repository.loadAssignmentBundle(assignment.id))
  );
  const failed = bundles.find(bundle => !bundle.ok);
  if (failed) return failed;
  let stored;
  try {
    stored = await receiptStore.listAll();
  } catch {
    return unavailable('Historia lokale nuk është e disponueshme.');
  }
  if (!stored.ok) return stored;
  const visible = stored.value.filter(receipt =>
    bundles.some(bundle => receiptMatchesBundle(receipt, bundle.value, profile.value.accountId))
  );
  const superseded = new Set(visible.map(receipt => receipt.previousReceiptId).filter(Boolean));
  const rows = visible
    .map(receipt => {
      const bundle = bundles.find(
        candidate => candidate.value.assignment.id === receipt.assignmentId
      );
      return {
        ...receipt,
        title: bundle.value.assignment.titleSq,
        historyStatus: superseded.has(receipt.receiptId) ? 'superseded' : 'submitted',
      };
    })
    .sort((left, right) => right.submittedAt.localeCompare(left.submittedAt));
  return { ok: true, value: rows, reviewer: profile.value };
}
