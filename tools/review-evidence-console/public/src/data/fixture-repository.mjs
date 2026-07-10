import assignments from '../../data/assignments.mjs';
import accessRoles from '../../data/items/m03a-access-roles.mjs';
import consentFields from '../../data/items/m03a-consent-fields.mjs';
import documentBoundary from '../../data/items/m03a-document-boundary.mjs';
import erasureRevocation from '../../data/items/m03a-erasure-revocation.mjs';
import medicalBoundary from '../../data/items/m03a-medical-boundary.mjs';
import privacyOwner from '../../data/items/m03a-privacy-owner.mjs';
import scopeStops from '../../data/items/m03a-scope-stops.mjs';
import threatRecheck from '../../data/items/m03a-threat-recheck.mjs';
import partAMetadata from '../../data/packets/mob-03a-part-a.mjs';
import partBMetadata from '../../data/packets/mob-03a-part-b.mjs';
import reviewers from '../../data/reviewers.mjs';

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
const missing = (message = 'Fixture-i nuk u gjet.') => ({ ok: false, code: 'not_found', message });
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
      return invalid('Regjistrimet e mostrës janë të pavlefshme.');
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
    return reviewer
      ? { ok: true, value: reviewer }
      : missing('Mostra e shqyrtuesit nuk u gjet.');
  }

  async function loadPacket(packetId) {
    try {
      const value = await loadJson(`/data/packets/${packetId}.json`);
      if (value === undefined) return missing('Mostra e paketës nuk u gjet.');
      return { ok: true, value: normalizePacket(value) };
    } catch {
      return invalid('Mostra e paketës është e pavlefshme.');
    }
  }

  async function loadAssignmentBundle(assignmentId) {
    const all = await loadAll();
    if (!all.ok) return all;
    const assignment = all.value.assignments.find(row => row.id === assignmentId);
    if (!assignment) return missing('Mostra e detyrës nuk u gjet.');
    const reviewer = all.value.reviewers.find(row => row.id === assignment.reviewerFixtureId);
    if (!reviewer) return invalid('Mostra e shqyrtuesit të detyrës është e pavlefshme.');
    const packet = await loadPacket(assignment.packetId);
    if (!packet.ok) return packet;
    if (
      assignment.packetId !== packet.value.id ||
      assignment.reviewerRole !== reviewer.role ||
      reviewer.role !== packet.value.reviewerRole
    ) {
      return invalid('Rolet e detyrës, shqyrtuesit dhe paketës nuk përputhen.');
    }
    return { ok: true, value: { assignment, reviewer, packet: packet.value } };
  }

  return { listAssignments, loadPacket, loadReviewerProfile, loadAssignmentBundle };
}
