import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ session: vi.fn() }));
vi.mock('@/lib/auth.server', () => ({ getCachedSession: state.session }));
vi.mock('./_core.entry', () => ({ default: () => <div>Platform controls</div> }));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NOT_FOUND');
  },
  redirect: () => {
    throw new Error('LOGIN');
  },
}));

import Page from './page';

async function openPage() {
  return Page();
}

describe('platform settings page', () => {
  beforeEach(() => vi.clearAllMocks());

  it.each(['tenant_admin', 'admin', 'branch_manager', 'staff', 'agent', 'member', 'unknown'])(
    'never mounts controls for %s',
    async role => {
      state.session.mockResolvedValue({ user: { id: 'u1', role } });
      await expect(openPage()).rejects.toThrow('NOT_FOUND');
    }
  );

  it('sends an anonymous caller to login', async () => {
    state.session.mockResolvedValue(null);
    await expect(openPage()).rejects.toThrow('LOGIN');
  });

  it('renders controls for super_admin', async () => {
    state.session.mockResolvedValue({ user: { id: 'u1', role: 'super_admin' } });
    expect(renderToStaticMarkup(await Page())).toContain('Platform controls');
  });
});
