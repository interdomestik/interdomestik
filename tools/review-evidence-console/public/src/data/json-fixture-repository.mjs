import {
  normalizeAssignment,
  normalizePacket,
  normalizeReviewer,
  validateAssignmentContinuations,
} from '../models/normalize-fixture.mjs';

const missing = (message = 'Fixture-i nuk u gjet.') => ({ ok: false, code: 'not_found', message });
const invalid = message => ({ ok: false, code: 'invalid_data', message });

export function createJsonFixtureRepository(loadJson) {
  async function loadAll() {
    try {
      const [reviewers, assignments] = await Promise.all([
        loadJson('/data/reviewers.json'),
        loadJson('/data/assignments.json'),
      ]);
      if (!Array.isArray(reviewers) || !Array.isArray(assignments)) throw new TypeError();
      return {
        ok: true,
        value: {
          reviewers: reviewers.map(normalizeReviewer),
          assignments: validateAssignmentContinuations(assignments.map(normalizeAssignment)),
        },
      };
    } catch {
      return invalid('Regjistrimet e mostrës janë të pavlefshme.');
    }
  }
  async function loadPacket(packetId) {
    try {
      const value = await loadJson(`/data/packets/${packetId}.json`);
      return value === undefined
        ? missing('Mostra e paketës nuk u gjet.')
        : { ok: true, value: normalizePacket(value) };
    } catch {
      return invalid('Mostra e paketës është e pavlefshme.');
    }
  }
  async function listAssignments(reviewerId) {
    const all = await loadAll();
    return all.ok
      ? { ok: true, value: all.value.assignments.filter(row => row.reviewerFixtureId === reviewerId) }
      : all;
  }
  async function loadReviewerProfile(reviewerId) {
    const all = await loadAll();
    if (!all.ok) return all;
    const reviewer = all.value.reviewers.find(row => row.id === reviewerId);
    return reviewer ? { ok: true, value: reviewer } : missing('Mostra e shqyrtuesit nuk u gjet.');
  }
  async function loadAssignmentBundle(assignmentId) {
    const all = await loadAll();
    if (!all.ok) return all;
    const assignment = all.value.assignments.find(row => row.id === assignmentId);
    if (!assignment) return missing('Mostra e detyrës nuk u gjet.');
    const reviewer = all.value.reviewers.find(row => row.id === assignment.reviewerFixtureId);
    const packet = await loadPacket(assignment.packetId);
    if (!reviewer || !packet.ok) return packet.ok ? invalid('Mostra është e pavlefshme.') : packet;
    if (
      assignment.packetId !== packet.value.id ||
      assignment.reviewerRole !== reviewer.role ||
      reviewer.role !== packet.value.reviewerRole
    ) return invalid('Rolet e detyrës, shqyrtuesit dhe paketës nuk përputhen.');
    return { ok: true, value: { assignment, reviewer, packet: packet.value } };
  }
  return { listAssignments, loadPacket, loadReviewerProfile, loadAssignmentBundle };
}
