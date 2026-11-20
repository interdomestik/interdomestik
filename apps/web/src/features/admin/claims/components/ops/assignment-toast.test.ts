import { describe, expect, it } from 'vitest';
import {
  ASSIGNMENT_CONFLICT_ERROR,
  ASSIGNMENT_DRAFT_ERROR,
  ASSIGNMENT_TARGET_DENIED_ERROR,
} from '../../actions/ops-assignment';
import { assignmentErrorToastKey } from './assignment-toast';

describe('assignmentErrorToastKey', () => {
  it.each([
    [ASSIGNMENT_CONFLICT_ERROR, 'errors.conflict'],
    [ASSIGNMENT_DRAFT_ERROR, 'errors.draft'],
    [ASSIGNMENT_TARGET_DENIED_ERROR, 'errors.target_denied'],
  ])('maps the server denial %j to a localized key', (error, key) => {
    expect(assignmentErrorToastKey(error)).toBe(key);
  });

  it.each([undefined, null, '', 'Unauthorized', 'Action failed. Please try again.'])(
    'returns null for %j so callers use their generic localized failure',
    error => {
      expect(assignmentErrorToastKey(error)).toBeNull();
    }
  );
});
