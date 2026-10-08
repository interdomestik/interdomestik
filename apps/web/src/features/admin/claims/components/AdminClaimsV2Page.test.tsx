import { fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { LifecycleStats } from '../types';
import { STATS, ZERO_STATS, okResponse } from './__tests__/admin-claims-page-fixtures';
import AdminClaimsV2Page from './AdminClaimsV2Page';

const state = vi.hoisted(() => ({
  getSession: vi.fn(),
  getAdminClaimsV2: vi.fn(),
  refresh: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: state.getSession } } }));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));
vi.mock('next-intl/server', () => ({
  getTranslations: async () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${JSON.stringify(values)}` : key,
}));
vi.mock('next-intl', () => ({
  useLocale: () => 'sq',
  useTranslations: () => (key: string) => key,
}));
vi.mock('@/i18n/routing', () => ({
  useRouter: () => ({ refresh: state.refresh, push: state.push, replace: state.replace }),
}));
// Real visibility policy (canViewAdminClaims); only the DB-backed loader is replaced.
vi.mock('../server', async () => {
  const visibility = await vi.importActual<typeof import('../server/claimVisibility')>(
    '../server/claimVisibility'
  );
  return {
    canViewAdminClaims: visibility.canViewAdminClaims,
    resolveClaimsVisibility: visibility.resolveClaimsVisibility,
    getAdminClaimsV2: state.getAdminClaimsV2,
  };
});
vi.mock('@/components/admin/claims/claims-filters', () => ({
  AdminClaimsFilters: () => <input aria-label="Search claims" data-testid="claims-filters" />,
}));
vi.mock('./ClaimsLifecycleTabs', () => ({
  ClaimsLifecycleTabs: ({ stats }: { stats: LifecycleStats }) => (
    <div data-testid="claims-lifecycle-tabs">
      all ({Object.values(stats).reduce((sum, count) => sum + count, 0)})
    </div>
  ),
}));
vi.mock('./ClaimsOperationalList', () => ({
  ClaimsOperationalList: ({ claims }: { claims: Array<{ id: string }> }) =>
    claims.length === 0 ? (
      <p data-testid="claims-empty-state">table.empty_state</p>
    ) : (
      <ul>
        {claims.map(claim => (
          <li key={claim.id} data-testid="claim-operational-card">
            {claim.id}
          </li>
        ))}
      </ul>
    ),
}));
vi.mock('./ops/OpsCenterPage', () => ({
  default: () => <div data-testid="ops-center-stub" />,
}));

function signIn(user: Record<string, unknown>) {
  state.getSession.mockResolvedValue({
    session: { id: 'session-1' },
    user: { id: 'user-1', tenantId: 'tenant-1', ...user },
  });
}

async function pageElement(params: Record<string, string | string[] | undefined> = {}) {
  return (await AdminClaimsV2Page({ searchParams: Promise.resolve(params) })) as ReactElement;
}

async function renderPage(params: Record<string, string | string[] | undefined> = {}) {
  return render(await pageElement(params));
}

describe('AdminClaimsV2Page server consumer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    signIn({ role: 'admin' });
  });

  it('renders a failed initial read as a localized alert with same-route retry and no data', async () => {
    state.getAdminClaimsV2.mockResolvedValue({ kind: 'error', error: 'read_failed' });
    const view = await renderPage({ lifecycle: 'legal', search: 'ana', status: 'active' });

    expect(screen.getByTestId('admin-claims-v2-ready')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('read_failed');
    expect(screen.getByTestId('admin-claims-read-recovery')).toBeInTheDocument();
    expect(screen.getByTestId('claims-filters')).toBeInTheDocument();

    expect(screen.queryByTestId('claims-lifecycle-tabs')).not.toBeInTheDocument();
    expect(screen.queryByTestId('claim-operational-card')).not.toBeInTheDocument();
    expect(screen.queryByTestId('claims-empty-state')).not.toBeInTheDocument();
    expect(view.container).not.toHaveTextContent('pagination_info');

    fireEvent.click(screen.getByRole('button', { name: 'tryAgain' }));
    expect(state.refresh).toHaveBeenCalledOnce();
    expect(state.push).not.toHaveBeenCalled();
    expect(state.replace).not.toHaveBeenCalled();
    expect(state.getAdminClaimsV2).toHaveBeenCalledTimes(1);
  });

  it('associates the error region with the single actual h1 even on the initial failed read', async () => {
    state.getAdminClaimsV2.mockResolvedValue({ kind: 'error', error: 'read_failed' });
    const view = await renderPage();

    const headings = screen.getAllByRole('heading', { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveAttribute('id', 'admin-claims-heading');
    expect(view.container.querySelectorAll('#admin-claims-heading')).toHaveLength(1);

    const region = screen.getByTestId('admin-claims-read-region');
    expect(region).toHaveAttribute('aria-labelledby', 'admin-claims-heading');
    expect(screen.getByRole('region', { name: 'title' })).toBe(region);
    expect(within(region).getByTestId('claims-filters')).toBeInTheDocument();
  });

  it.each([
    ['failed', { kind: 'error', error: 'read_failed' }],
    ['ok', okResponse([], ZERO_STATS)],
  ])(
    'marks the %s ready box and narrow card for the layout gutter override',
    async (_k, result) => {
      state.getAdminClaimsV2.mockResolvedValue(result);
      await renderPage();

      const ready = screen.getByTestId('admin-claims-v2-ready');
      expect(ready).toHaveAttribute('data-admin-claims-list');
      expect(screen.getByTestId('admin-claims-read-region').parentElement).toHaveClass(
        'p-2',
        'sm:p-6'
      );
    }
  );

  it('renders populated success with tabs, rows and pagination and no recovery', async () => {
    state.getAdminClaimsV2.mockResolvedValue(okResponse([{ id: 'c-1' }, { id: 'c-2' }], STATS, 3));
    await renderPage();

    expect(screen.getByTestId('admin-claims-v2-ready')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByTestId('admin-claims-read-recovery')).not.toBeInTheDocument();
    expect(screen.getByTestId('claims-lifecycle-tabs')).toHaveTextContent('all (3)');
    expect(screen.getAllByTestId('claim-operational-card')).toHaveLength(2);
    expect(screen.getByText(/^pagination_info:/)).toHaveTextContent('"total":3');
  });

  it('keeps a successful empty read distinct from a failed read', async () => {
    state.getAdminClaimsV2.mockResolvedValue(okResponse([], ZERO_STATS));
    await renderPage();

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'tryAgain' })).not.toBeInTheDocument();
    expect(screen.getByTestId('claims-empty-state')).toHaveTextContent('table.empty_state');
    expect(screen.getByTestId('claims-lifecycle-tabs')).toHaveTextContent('all (0)');
    expect(screen.queryByText(/pagination_info/)).not.toBeInTheDocument();
  });

  it('announces the filtered total, not the loaded rows, in a claims-only polite output', async () => {
    const rows = [{ id: 'c-1' }, { id: 'c-2' }];
    state.getAdminClaimsV2.mockResolvedValue(okResponse(rows, STATS, 3, 47));
    await renderPage();

    const region = screen.getByTestId('admin-claims-read-region');
    const result = within(region).getByTestId('admin-claims-read-result');
    expect(screen.getAllByTestId('admin-claims-read-result')).toHaveLength(1);
    expect(result.tagName).toBe('OUTPUT');
    expect(result).toHaveAttribute('aria-live', 'polite');
    expect(result).toHaveClass('sr-only');
    expect(result).toHaveTextContent('read_result:{"count":47}');
    expect(screen.getAllByTestId('claim-operational-card')).toHaveLength(2);
  });

  it('announces a true empty read as zero without an alert or a recovery', async () => {
    state.getAdminClaimsV2.mockResolvedValue(okResponse([], ZERO_STATS));
    await renderPage();

    expect(screen.getByTestId('admin-claims-read-result')).toHaveTextContent(
      'read_result:{"count":0}'
    );
    expect(screen.getByTestId('claims-empty-state')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByTestId('admin-claims-read-recovery')).not.toBeInTheDocument();
  });

  it('keeps the result output empty and outside the recovery on a failed read', async () => {
    state.getAdminClaimsV2.mockResolvedValue({ kind: 'error', error: 'read_failed' });
    await renderPage();

    const result = screen.getByTestId('admin-claims-read-result');
    expect(result).toBeEmptyDOMElement();
    expect(screen.getByTestId('admin-claims-read-recovery')).not.toContainElement(result);
    expect(screen.getByTestId('admin-claims-read-region')).toContainElement(result);
  });

  it('keeps the same mounted output across a failed read followed by a successful one', async () => {
    state.getAdminClaimsV2
      .mockResolvedValueOnce({ kind: 'error', error: 'read_failed' })
      .mockResolvedValueOnce(okResponse([{ id: 'c-1' }], STATS, 1, 9));
    const view = await renderPage();
    const failed = screen.getByTestId('admin-claims-read-result');
    expect(failed).toBeEmptyDOMElement();
    expect(screen.getByRole('alert')).toBeInTheDocument();

    view.rerender(await pageElement());

    expect(screen.getByTestId('admin-claims-read-result')).toBe(failed);
    expect(failed).toHaveTextContent('read_result:{"count":9}');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByTestId('admin-claims-read-recovery')).not.toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByTestId('admin-claims-v2-ready')).toBeInTheDocument();
  });

  it('forwards the URL filters to the loader for success and failure alike', async () => {
    const params = {
      page: '2',
      lifecycle: 'legal',
      search: 'ana',
      status: 'active',
      assigned: 'me',
      diaspora: 'diaspora',
    };
    const expected = expect.objectContaining({
      page: 2,
      lifecycleStage: 'legal',
      search: 'ana',
      status: 'active',
      assigned: 'me',
      diasporaOrigin: 'diaspora',
    });

    state.getAdminClaimsV2.mockResolvedValueOnce(okResponse([{ id: 'c-1' }], STATS));
    const first = await renderPage(params);
    expect(state.getAdminClaimsV2).toHaveBeenLastCalledWith(
      expect.objectContaining({ tenantId: 'tenant-1', role: 'admin' }),
      expected
    );
    first.unmount();

    state.getAdminClaimsV2.mockResolvedValueOnce({ kind: 'error', error: 'read_failed' });
    await renderPage(params);
    expect(state.getAdminClaimsV2).toHaveBeenLastCalledWith(expect.anything(), expected);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('keeps the explicit ops route on the ops center without reading the list', async () => {
    await renderPage({ view: 'ops' });
    expect(screen.getByTestId('ops-center-stub')).toBeInTheDocument();
    expect(state.getAdminClaimsV2).not.toHaveBeenCalled();
  });

  it.each([
    ['member', { role: 'member' }],
    ['agent', { role: 'agent' }],
    ['staff', { role: 'staff' }],
    ['role-less', {}],
    ['branch manager without a branch', { role: 'branch_manager' }],
  ])('denies %s before any read', async (_label, user) => {
    signIn(user);
    await expect(renderPage()).rejects.toThrow('NEXT_NOT_FOUND');
    expect(state.getAdminClaimsV2).not.toHaveBeenCalled();
  });

  it('denies a missing session before any read', async () => {
    state.getSession.mockResolvedValue(null);
    await expect(renderPage()).rejects.toThrow('NEXT_NOT_FOUND');
    expect(state.getAdminClaimsV2).not.toHaveBeenCalled();
  });

  it.each([
    ['admin', { role: 'admin' }],
    ['tenant admin', { role: 'tenant_admin' }],
    ['super admin', { role: 'super_admin' }],
    ['branch manager with a branch', { role: 'branch_manager', branchId: 'branch-a' }],
  ])('allows %s to read the list', async (_label, user) => {
    signIn(user);
    state.getAdminClaimsV2.mockResolvedValue(okResponse([], ZERO_STATS));
    await renderPage();
    expect(state.getAdminClaimsV2).toHaveBeenCalledOnce();
    expect(screen.getByTestId('admin-claims-v2-ready')).toBeInTheDocument();
  });
});
