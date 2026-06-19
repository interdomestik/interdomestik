import { describe, expect, it } from 'vitest';

import { isRecoveryGrantActorRole } from './jurisdiction-handoff-store';

describe('isRecoveryGrantActorRole', () => {
  it('allows only recovery staff and admin-style actors to receive handoff grants', () => {
    expect(isRecoveryGrantActorRole('staff')).toBe(true);
    expect(isRecoveryGrantActorRole('admin')).toBe(true);
    expect(isRecoveryGrantActorRole('tenant_admin')).toBe(true);
    expect(isRecoveryGrantActorRole('super_admin')).toBe(true);
    expect(isRecoveryGrantActorRole('member')).toBe(false);
    expect(isRecoveryGrantActorRole('user')).toBe(false);
    expect(isRecoveryGrantActorRole('agent')).toBe(false);
    expect(isRecoveryGrantActorRole('branch_manager')).toBe(false);
    expect(isRecoveryGrantActorRole(null)).toBe(false);
  });
});
