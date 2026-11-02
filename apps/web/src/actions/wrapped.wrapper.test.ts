import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { describe, expect, it, vi } from 'vitest';

import { getWrappedStats } from './wrapped';

vi.mock('./wrapped/context', () => ({
  getActionContext: vi.fn(),
}));

vi.mock('./wrapped/get', () => ({
  getWrappedStatsCore: vi.fn(),
}));

describe('actions/wrapped wrapper', () => {
  it('delegates to core with session from context', async () => {
    const authority = mintTestTenantAuthority('tenant-1');
    const { getActionContext } = await import('./wrapped/context');
    const { getWrappedStatsCore } = await import('./wrapped/get');

    (getActionContext as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      session: { user: { id: 'u1', name: 'Member' } },
      authority,
    });

    (getWrappedStatsCore as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });

    const result = await getWrappedStats();

    expect(getWrappedStatsCore).toHaveBeenCalledWith({
      session: { user: { id: 'u1', name: 'Member' } },
      authority,
    });
    expect(result).toEqual({ ok: true });
  });
});
