import {
  normalizeAssignment,
  normalizePacket,
  normalizeReviewer,
  validateAssignmentContinuations,
} from '../models/normalize-fixture.mjs';
import { createSignedReceiptVerifier } from './receipt-signature-verifier.mjs';

const MESSAGES = Object.freeze({
  session_expired: 'Sesioni ka përfunduar. Hyni përsëri.',
  forbidden: 'Nuk keni qasje në këtë detyrë.',
  not_found: 'Detyra nuk u gjet.',
  conflict: 'Të dhënat kanë ndryshuar. Ringarkoni faqen.',
  rate_limited: 'Shumë tentativa. Provoni përsëri më vonë.',
  unavailable: 'Shërbimi nuk është i disponueshëm.',
});

function failure(error) {
  const code = Object.hasOwn(MESSAGES, error?.code) ? error.code : 'unavailable';
  return { ok: false, code, message: MESSAGES[code] };
}

async function resultOf(operation, normalize = value => value) {
  try {
    return { ok: true, value: normalize(await operation()) };
  } catch (error) {
    return failure(error);
  }
}

function normalizeSession(value) {
  return normalizeReviewer({
    id: value.fixtureId,
    displayName: value.displayName,
    role: value.role,
    repoSafe: true,
    draftScope: value.draftScope,
    sessionExpiresAt: value.sessionExpiresAt,
  });
}

function normalizeBundle(value) {
  const assignment = normalizeAssignment(value.assignment);
  const reviewer = normalizeReviewer(value.reviewer);
  const packet = normalizePacket(value.packet);
  if (
    assignment.reviewerFixtureId !== reviewer.id ||
    assignment.reviewerRole !== reviewer.role ||
    reviewer.role !== packet.reviewerRole ||
    assignment.packetId !== packet.id
  ) {
    throw Object.assign(new TypeError(), { code: 'unavailable' });
  }
  return { assignment, reviewer, packet };
}

export function createApiFixtureRepository(client) {
  const verifySignedReceipt = createSignedReceiptVerifier(client.receiptKeys);
  return Object.freeze({
    loadReviewerProfile: () => resultOf(client.session, normalizeSession),
    listAssignments: () =>
      resultOf(client.listAssignments, rows =>
        validateAssignmentContinuations(rows.map(normalizeAssignment))
      ),
    loadAssignmentBundle: id => resultOf(() => client.loadAssignment(id), normalizeBundle),
    buildReceipt: input => {
      const submission = {
        assignmentId: input.assignmentId,
        decisions: input.decisions,
        structuredResponses: input.structuredResponses,
        safeEvidenceConfirmed: true,
        ...(input.previousReceipt
          ? {
              previousReceipt: input.previousReceipt,
              correctionItemId: input.correctionItemId,
              correctionReason: input.correctionReason,
              correctionImpact: input.correctionImpact,
            }
          : {}),
      };
      return input.previousReceipt
        ? client.correctReceipt(submission)
        : client.submitReceipt(submission);
    },
    verifyReceipt: verifySignedReceipt,
  });
}
