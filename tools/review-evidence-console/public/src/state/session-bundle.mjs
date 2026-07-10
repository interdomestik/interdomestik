import {
  normalizeAssignment,
  normalizePacket,
  normalizeReviewer,
} from '../models/normalize-fixture.mjs';
import { deepFreeze } from './review-session-state.mjs';

export function ownSessionBundle(bundle) {
  if (!bundle || typeof bundle !== 'object') throw new TypeError('Review bundle is required.');
  return deepFreeze({
    assignment: normalizeAssignment(structuredClone(bundle.assignment)),
    reviewer: normalizeReviewer(structuredClone(bundle.reviewer)),
    packet: normalizePacket(structuredClone(bundle.packet)),
  });
}
