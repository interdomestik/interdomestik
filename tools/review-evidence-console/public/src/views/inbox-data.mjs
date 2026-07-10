const PROGRESS = Object.freeze({
  not_started: 'Nuk ka filluar',
  in_progress: 'Në progres — hap paketën për detaje',
  ready: 'Gati për dorëzim',
  submitted: 'Dërguar',
});

export function progressCopy(status) {
  return PROGRESS[status] ?? 'Status i panjohur';
}

export async function loadInboxRows(repository, reviewerId) {
  const assignments = await repository.listAssignments(reviewerId);
  if (!assignments.ok) return assignments;
  const bundles = await Promise.all(
    assignments.value.map(assignment => repository.loadAssignmentBundle(assignment.id))
  );
  const failed = bundles.find(bundle => !bundle.ok);
  if (failed) return failed;
  const rows = bundles.map((bundle, index) => {
    const expected = assignments.value[index];
    return bundleMatches(bundle.value, expected, reviewerId) ? toInboxRow(bundle.value) : null;
  });
  if (rows.some(row => !row)) {
    return {
      ok: false,
      code: 'invalid_data',
      message: 'Assignment bundle identity is inconsistent.',
    };
  }
  return { ok: true, value: rows };
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
  const part = assignment.packetId.endsWith('part-a') ? 'A' : 'B';
  const purpose =
    part === 'A'
      ? 'Verifiko kufijtë e privatësisë, pëlqimin dhe rolet e aksesit.'
      : 'Verifiko kufijtë e dokumenteve, kërcënimet dhe kushtet e ndalimit.';
  return {
    ...assignment,
    firstItemId: packet.itemIds[0],
    title: `Rishikimi i autoritetit — Pjesa ${part}`,
    purpose,
    progress: progressCopy(assignment.status),
  };
}
