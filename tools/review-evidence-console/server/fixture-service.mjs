import {
  normalizeAssignment,
  normalizePacket,
  normalizeReviewer,
  validateAssignmentContinuations,
} from '../public/src/models/normalize-fixture.mjs';

import { fixtureCatalog } from './fixtures/catalog.mjs';

const notFound = () => ({ ok: false, code: 'not_found', message: 'Detyra nuk u gjet.' });
const matchesAccount = (assignment, account) =>
  assignment.reviewerFixtureId === account?.fixtureId && assignment.reviewerRole === account?.role;

export function createFixtureService({ catalog = fixtureCatalog } = {}) {
  const reviewers = catalog.reviewers.map(normalizeReviewer);
  const assignments = validateAssignmentContinuations(catalog.assignments.map(normalizeAssignment));
  const packets = new Map(catalog.packets.map(value => [value.id, normalizePacket(value)]));

  async function listAssignments(account) {
    return {
      ok: true,
      value: structuredClone(assignments.filter(row => matchesAccount(row, account))),
    };
  }

  async function loadAssignment(account, assignmentId) {
    const assignment = assignments.find(
      row => row.id === assignmentId && matchesAccount(row, account)
    );
    if (!assignment) return notFound();
    const reviewer = reviewers.find(row => row.id === assignment.reviewerFixtureId);
    const packet = packets.get(assignment.packetId);
    if (
      !reviewer ||
      !packet ||
      reviewer.role !== account.role ||
      reviewer.role !== packet.reviewerRole ||
      assignment.packetId !== packet.id
    ) {
      return notFound();
    }
    return {
      ok: true,
      value: structuredClone({
        assignment,
        packet,
        reviewer: {
          id: reviewer.id,
          displayName: account.displayName,
          role: account.role,
          repoSafe: reviewer.repoSafe,
          draftScope: account.draftScope,
        },
      }),
    };
  }

  return Object.freeze({ listAssignments, loadAssignment });
}
