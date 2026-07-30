import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  // prettier-ignore
  intake: vi.fn((props: Record<string, unknown>) => <div data-testid="claim-draft-intake-props">{JSON.stringify(props)}<button data-testid="claim-draft-submit-disabled" type="button" disabled>Dormant submit</button></div>),
  session: vi.fn(),
  member: vi.fn(),
  tenant: vi.fn(() => 'tenant_ks'),
  msg: vi.fn(async () => ({ freeStart: { marker: 'page-scoped' } })),
  t: vi.fn(async () => (key: string) => key),
  head: vi.fn(async () => new Headers({ host: 'ida.localhost' })),
  go: vi.fn(() => {
    throw new Error('NEXT_REDIRECT');
  }),
}));

vi.mock('next-intl/server', () => ({
  getTranslations: h.t,
}));
vi.mock('next/navigation', () => ({ redirect: h.go }));
vi.mock('next/headers', () => ({ headers: h.head }));
vi.mock('@/components/claims/claim-draft-intake', () => ({
  ClaimDraftIntake: (props: Record<string, unknown>) => h.intake(props),
}));
vi.mock('@/components/shell/session', () => ({ getSessionSafe: h.session }));
vi.mock('@/i18n/messages', () => ({ loadMessagesForNamespaces: h.msg }));
vi.mock('@interdomestik/domain-membership-billing/subscription', () => ({
  hasActiveMembership: h.member,
}));
vi.mock('@interdomestik/shared-auth', () => ({ ensureTenantId: h.tenant }));
vi.mock('@interdomestik/ui', () => ({
  Button: ({ children }: { children: React.ReactNode }) => <button>{children}</button>,
}));
vi.mock('@/i18n/routing', () => ({
  // prettier-ignore
  Link: ({ children, href = '#' }: { children: React.ReactNode; href?: string }) => (
    <a href={typeof href === 'string' && href.startsWith('/') ? `/en${href}` : href}>{children}</a>
  ),
}));

import NewClaimPage from './page';
import { resolveClaimStartHandoff, resolveNeutralOtpHost } from './_core.entry';

type Query = Record<string, string | string[] | undefined>;
// prettier-ignore
const loadPage = (query: Query = {}) => NewClaimPage({ params: Promise.resolve({ locale: 'en' }), searchParams: Promise.resolve(query) }), poisonedQuery = Object.setPrototypeOf({ mode: 'drafts' }, ['__proto__', 'x']), ok = ['member', 'tenant_ks', new Headers({ host: 'ida.localhost' })] as const;

describe('NewClaimPage dormant draft intake', () => {
  afterEach(() => vi.unstubAllEnvs());

  beforeEach(() => {
    vi.clearAllMocks();
    h.head.mockReset();
    h.head.mockResolvedValue(new Headers({ host: 'ida.localhost' }));
    // prettier-ignore
    h.session.mockResolvedValue({ user: { id: 'member-1', role: 'member', tenantId: 'tenant_ks' } });
    h.member.mockResolvedValue(true);
  });

  it('normalizes the accepted diaspora handoff only', () => {
    // prettier-ignore
    expect(resolveClaimStartHandoff({ source: 'diaspora-green-card', country: 'IT', incidentLocation: 'abroad' }))
      .toEqual({ source: 'diaspora-green-card', country: 'IT', incidentLocation: 'abroad' });
    // prettier-ignore
    expect(resolveClaimStartHandoff({ source: 'diaspora-green-card', country: 'FR', incidentLocation: 'abroad' })).toBeNull();
  });

  it.each([
    ['front-door.localhost:3000', 'front-door.localhost:3000'],
    ['https://front-door.localhost:3000', 'front-door.localhost:3000'],
    ['https://front-door.localhost:3000/path', null],
  ])('normalizes only an accepted configured IDA host: %s', (configured, expected) => {
    vi.stubEnv('IDA_HOST', configured);
    expect(resolveNeutralOtpHost()).toBe(expected);
  });

  it('preserves route context and renders the dormant intake for an active member', async () => {
    vi.stubEnv('IDA_HOST', 'https://front-door.localhost:3000');
    const handoffContext = {
      source: 'diaspora-green-card',
      country: 'IT',
      incidentLocation: 'abroad',
    } as const;
    const tree = await loadPage({ category: 'travel', ...handoffContext });
    render(tree);
    expect(h.session).toHaveBeenCalledWith('MemberNewClaimPage');
    expect(h.t).toHaveBeenCalledWith({ locale: 'en', namespace: 'claims' });
    expect(h.member).toHaveBeenCalledWith('member-1', 'tenant_ks');
    // prettier-ignore
    expect(h.intake).toHaveBeenCalledWith({ freeStartMessages: { freeStart: { marker: 'page-scoped' } }, handoffContext, initialCategory: 'travel', locale: 'en', managerOnly: false, neutralOtpHost: 'front-door.localhost:3000', tenantId: 'tenant_ks' });
    expect(screen.getByTestId('new-claim-page-ready')).toBeInTheDocument();
    expect(screen.getByTestId('claim-draft-intake-props')).toBeInTheDocument();
    expect(screen.getByTestId('claim-draft-submit-disabled')).toBeDisabled();
  });

  it('preserves the unauthenticated go', async () => {
    h.session.mockResolvedValueOnce(null);
    await expect(loadPage()).rejects.toThrow('NEXT_REDIRECT');
    expect(h.go).toHaveBeenCalledWith('/en/login');
    expect(h.head).not.toHaveBeenCalled();
    expect(h.member).not.toHaveBeenCalled();
  });

  it('preserves the active-member gate and localized pricing link', async () => {
    h.member.mockResolvedValueOnce(false);
    const tree = await loadPage();
    render(tree);
    expect(screen.getByTestId('new-claim-page-ready')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'gate.view_plans' })).toHaveAttribute(
      'href',
      '/en/pricing'
    );
    expect(h.intake).not.toHaveBeenCalled();
    expect(h.msg).not.toHaveBeenCalled();
  });

  // prettier-ignore
  it.each([
    ['array mode', { mode: ['drafts'] }, ...ok],
    ['hidden key', poisonedQuery, ...ok],
    ['extra key', { mode: 'drafts', source: 'x' }, ...ok],
    ['case drift', { mode: 'Drafts' }, ...ok],
    ['whitespace', { mode: ' drafts' }, ...ok],
    ['other role', { mode: 'drafts' }, 'agent', 'tenant_ks', new Headers({ host: 'ida.localhost' })],
    ['tenant mismatch', { mode: 'drafts' }, 'member', 'tenant_mk', new Headers({ host: 'ida.localhost' })],
    ['spoofed host', { mode: 'drafts' }, 'member', 'tenant_ks', new Headers({ host: 'ida.attacker.example' })],
    ['forwarded mismatch', { mode: 'drafts' }, 'member', 'tenant_ks', new Headers({ host: 'ida.localhost', 'x-forwarded-host': 'attacker.example' })],
  ])('fails closed for %s', async (_case, query, role, tenantId, requestHeaders) => {
    h.member.mockResolvedValueOnce(false);
    h.session.mockResolvedValueOnce({ user: { id: 'member-1', role, tenantId } });
    h.tenant.mockReturnValueOnce(tenantId);
    h.head.mockResolvedValueOnce(requestHeaders);
    render(await loadPage(query));
    expect(h.intake).not.toHaveBeenCalled();
  });

  it.each(['member', 'user'])('admits fulfilled inactive %s to exact manager mode', async role => {
    h.session.mockResolvedValueOnce({
      user: { id: 'member-1', role, tenantId: 'tenant_ks' },
    });
    h.member.mockResolvedValueOnce(false);
    const tree = await loadPage({ mode: 'drafts' });
    render(tree);
    expect(h.intake).toHaveBeenCalledWith(expect.objectContaining({ managerOnly: true }));

    h.member.mockRejectedValueOnce(new Error('member unavailable'));
    await expect(loadPage({ mode: 'drafts' })).rejects.toThrow('member unavailable');
  });
});
