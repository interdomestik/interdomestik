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
    const { getActionContext } = await import('./wrapped/context');
    const { getWrappedStatsCore } = await import('./wrapped/get');

    (getActionContext as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      session: { user: { id: 'u1', name: 'Member' } },
    });

    (getWrappedStatsCore as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });

    const result = await getWrappedStats();

    expect(getWrappedStatsCore).toHaveBeenCalledWith({
      session: { user: { id: 'u1', name: 'Member' } },
    });
    expect(result).toEqual({ ok: true });
  });
});
