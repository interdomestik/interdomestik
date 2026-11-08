import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  getSession: vi.fn(),
  listLeadDuplicatesAction: vi.fn(),
  panel: vi.fn((_props: { rows: unknown[]; state: string }) => null),
  redirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
}));

vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: hoisted.getSession } } }));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('next/navigation', () => ({ redirect: hoisted.redirect }));
vi.mock('next-intl/server', () => ({ getTranslations: async () => (key: string) => key }));
vi.mock('@/i18n/routing', () => ({
  Link: ({ children, href }: { children: unknown; href: string }) => (
    <a href={href}>{children as string}</a>
  ),
}));
vi.mock('@/components/admin/admin-page-header', () => ({ AdminPageHeader: () => null }));
vi.mock('@/components/ui/glass-card', () => ({
  GlassCard: ({ children }: { children: unknown }) => <div>{children as string}</div>,
}));
vi.mock('../actions/lead-duplicates', () => ({
  listLeadDuplicatesAction: hoisted.listLeadDuplicatesAction,
}));
vi.mock('./LeadDuplicateReviewPanel', () => ({ LeadDuplicateReviewPanel: hoisted.panel }));

import { LeadDuplicatesPage } from './LeadDuplicatesPage';

const render = async (state: 'pending' | 'resolved') =>
  renderToStaticMarkup(await LeadDuplicatesPage({ locale: 'en', state }));

describe('LeadDuplicatesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.getSession.mockResolvedValue({ user: { role: 'tenant_admin' } });
  });

  it('shows a loaded queue, including an empty one, through the review panel', async () => {
    hoisted.listLeadDuplicatesAction.mockResolvedValue({ success: true, data: [] });

    const html = await render('pending');

    expect(hoisted.panel).toHaveBeenCalledWith(
      { rows: [], state: 'pending', locale: 'en' },
      undefined
    );
    expect(html).not.toContain('lead-duplicates-error');
  });

  it('reports a failed load with a retry instead of an empty queue', async () => {
    hoisted.listLeadDuplicatesAction.mockResolvedValue({
      success: false,
      error: 'boom',
      code: 'INTERNAL',
    });

    const html = await render('resolved');

    expect(hoisted.panel).not.toHaveBeenCalled();
    expect(html).toContain('duplicates.load_error');
    expect(html).toContain('href="/admin/leads?view=duplicates&amp;state=resolved"');
  });

  it.each(['staff', 'agent'])('sends %s back to the verification queue', async role => {
    hoisted.getSession.mockResolvedValue({ user: { role } });

    await expect(render('pending')).rejects.toThrow('redirect:/admin/leads');
    expect(hoisted.listLeadDuplicatesAction).not.toHaveBeenCalled();
  });
});
