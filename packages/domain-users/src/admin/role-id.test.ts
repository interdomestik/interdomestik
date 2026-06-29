import { describe, expect, it } from 'vitest';

import { createRoleAssignmentId } from './role-id';

describe('createRoleAssignmentId', () => {
  it('creates a non-empty text id for role assignment rows', () => {
    expect(createRoleAssignmentId()).toMatch(/\S/);
  });
});
