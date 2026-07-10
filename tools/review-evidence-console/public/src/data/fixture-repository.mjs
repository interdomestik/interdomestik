import assignments from '../../data/assignments.json' with { type: 'json' };
import accessRoles from '../../data/items/m03a-access-roles.json' with { type: 'json' };
import consentFields from '../../data/items/m03a-consent-fields.json' with { type: 'json' };
import documentBoundary from '../../data/items/m03a-document-boundary.json' with { type: 'json' };
import erasureRevocation from '../../data/items/m03a-erasure-revocation.json' with { type: 'json' };
import medicalBoundary from '../../data/items/m03a-medical-boundary.json' with { type: 'json' };
import privacyOwner from '../../data/items/m03a-privacy-owner.json' with { type: 'json' };
import scopeStops from '../../data/items/m03a-scope-stops.json' with { type: 'json' };
import threatRecheck from '../../data/items/m03a-threat-recheck.json' with { type: 'json' };
import partAMetadata from '../../data/packets/mob-03a-part-a.json' with { type: 'json' };
import partBMetadata from '../../data/packets/mob-03a-part-b.json' with { type: 'json' };
import reviewers from '../../data/reviewers.json' with { type: 'json' };

import {
  normalizeAssignment,
  normalizePacket,
  normalizeReviewer,
} from '../models/normalize-fixture.mjs';

const partA = {
  ...partAMetadata,
  items: [privacyOwner, medicalBoundary, consentFields, accessRoles],
};
const partB = {
  ...partBMetadata,
  items: [documentBoundary, threatRecheck, erasureRevocation, scopeStops],
};
const FIXTURES = new Map([
  ['/data/reviewers.json', reviewers],
  ['/data/assignments.json', assignments],
  ['/data/packets/mob-03a-part-a.json', partA],
  ['/data/packets/mob-03a-part-b.json', partB],
]);
const missing = (message = 'Fixture was not found.') => ({ ok: false, code: 'not_found', message });
const invalid = message => ({ ok: false, code: 'invalid_data', message });

export async function defaultJsonLoader(pathname) {
  const value = FIXTURES.get(pathname);
  return value === undefined ? undefined : structuredClone(value);
}

export function createFixtureRepository({ loadJson = defaultJsonLoader } = {}) {
  async function loadAll() {
    try {
      const [reviewerRows, assignmentRows] = await Promise.all([
        loadJson('/data/reviewers.json'),
        loadJson('/data/assignments.json'),
      ]);
      if (!Array.isArray(reviewerRows) || !Array.isArray(assignmentRows)) throw new TypeError();
      return {
        ok: true,
        value: {
          reviewers: reviewerRows.map(normalizeReviewer),
          assignments: assignmentRows.map(normalizeAssignment),
        },
      };
    } catch {
      return invalid('Fixture records are invalid.');
    }
  }

  async function listAssignments(reviewerFixtureId) {
    const all = await loadAll();
    return all.ok
      ? {
          ok: true,
          value: all.value.assignments.filter(row => row.reviewerFixtureId === reviewerFixtureId),
        }
      : all;
  }

  async function loadReviewerProfile(reviewerFixtureId) {
    const all = await loadAll();
    if (!all.ok) return all;
    const reviewer = all.value.reviewers.find(row => row.id === reviewerFixtureId);
    return reviewer ? { ok: true, value: reviewer } : missing('Reviewer fixture was not found.');
  }

  async function loadPacket(packetId) {
    try {
      const value = await loadJson(`/data/packets/${packetId}.json`);
      if (value === undefined) return missing('Packet fixture was not found.');
      return { ok: true, value: normalizePacket(value) };
    } catch {
      return invalid('Packet fixture is invalid.');
    }
  }

  async function loadAssignmentBundle(assignmentId) {
    const all = await loadAll();
    if (!all.ok) return all;
    const assignment = all.value.assignments.find(row => row.id === assignmentId);
    if (!assignment) return missing('Assignment fixture was not found.');
    const reviewer = all.value.reviewers.find(row => row.id === assignment.reviewerFixtureId);
    if (!reviewer) return invalid('Assignment reviewer fixture is invalid.');
    const packet = await loadPacket(assignment.packetId);
    if (!packet.ok) return packet;
    if (
      assignment.packetId !== packet.value.id ||
      assignment.reviewerRole !== reviewer.role ||
      reviewer.role !== packet.value.reviewerRole
    ) {
      return invalid('Assignment, reviewer, and packet roles do not match.');
    }
    return { ok: true, value: { assignment, reviewer, packet: packet.value } };
  }

  return { listAssignments, loadPacket, loadReviewerProfile, loadAssignmentBundle };
}
