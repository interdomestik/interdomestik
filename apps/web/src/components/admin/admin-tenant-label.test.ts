import { describe, expect, it } from 'vitest';
import { formatAdminTenantLabel } from './admin-tenant-label';

describe('tenant display labels', () => {
  it.each([
    ['Interdomestik (MK)', 'MK'],
    ['Interdomestik (KS)', 'XK'],
  ])('keeps %s without a second suffix', (name, country) => {
    expect(formatAdminTenantLabel(name, country)).toBe(name);
  });
  it('uses the pilot display code for Kosovo when a suffix is absent', () => {
    expect(formatAdminTenantLabel('Interdomestik', 'XK')).toBe('Interdomestik (KS)');
  });
});
