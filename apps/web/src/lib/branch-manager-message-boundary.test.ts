import { describe, expect, it } from 'vitest';
import { deniesClaimMessageContent } from './branch-manager-message-boundary';

describe('exact branch-manager claim message boundary', () => {
  it('denies only the exact branch_manager role', () => {
    expect(deniesClaimMessageContent('branch_manager')).toBe(true);
    for (const role of [
      'tenant_admin',
      'admin',
      'staff',
      'super_admin',
      'member',
      'agent',
      'global_support',
      'auditor',
      'branch_manager,admin',
      ' branch_manager',
      '',
      null,
      undefined,
    ]) {
      expect(deniesClaimMessageContent(role), String(role)).toBe(false);
    }
  });
});
