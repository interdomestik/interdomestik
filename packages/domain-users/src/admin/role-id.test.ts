import { afterEach, describe, expect, it, vi } from 'vitest';

import { createRoleAssignmentId } from './role-id';

describe('createRoleAssignmentId', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('creates a non-empty text id for role assignment rows', () => {
    expect(createRoleAssignmentId()).toMatch(/\S/);
  });

  it('uses node crypto when web crypto is unavailable', () => {
    vi.stubGlobal('crypto', undefined);

    expect(createRoleAssignmentId()).toMatch(/\S/);
  });
});
