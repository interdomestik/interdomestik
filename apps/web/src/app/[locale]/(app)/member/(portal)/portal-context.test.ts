import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setRequestLocale } from 'next-intl/server';
import { LOCALES } from '@/i18n/locales';

const h = vi.hoisted(() => ({
  requests: new Map<unknown, Map<string, unknown>>(),
  session: vi.fn(),
  cases: vi.fn(async () => []),
  membership: vi.fn(async () => ({ bucket: 'active' })),
  neutral: true,
  pathname: '/member',
}));

// Model distinct RSC request cache lifetimes; production navigation/revocation
// still needs the real Next server. No module-global production cache is added.
vi.mock('react', async importOriginal => ({
  ...(await importOriginal<typeof import('react')>()),
  cache: (fn: (locale: string) => unknown) => (locale: string) => {
    if (!h.requests.has(fn)) h.requests.set(fn, new Map());
    const request = h.requests.get(fn)!;
    if (!request.has(locale)) request.set(locale, fn(locale));
    return request.get(locale);
  },
}));
vi.mock('@/lib/auth.server', () => ({ getCachedSession: h.session }));
vi.mock('@/components/shell/session', () => ({
  requireSessionOrRedirect: (session: unknown) => {
    if (!session) throw new Error('login');
    return session;
  },
}));
vi.mock('@interdomestik/domain-member', () => ({
  getMemberCaseSummaries: h.cases,
  getMemberPortalMembership: h.membership,
}));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('notFound');
  },
  redirect: (to: string) => {
    throw new Error(`redirect:${to}`);
  },
}));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('@/app/api/auth/[...all]/neutral-otp-boundary', () => ({
  evaluateNeutralOtpHost: () => h.neutral,
}));
vi.mock('@/lib/tenant/tenant-hosts', () => ({ resolveDefaultPublicTenantId: () => 'tenant_ks' }));
vi.mock('next-intl/server', () => ({
  setRequestLocale: vi.fn(),
  getTranslations: async () =>
    Object.assign((key: string) => key, {
      raw: () => {
        const values = new Proxy({}, { get: (_target, key) => String(key) });
        return {
          actions: values,
          description: 'description',
          disclaimer: 'disclaimer',
          navigation: {
            cases: 'cases',
            documents: 'documents',
            help_now: 'help',
            label: 'label',
            membership: 'membership',
          },
          next_steps: new Proxy({}, { get: (_target, key) => `portal-next-${String(key)}` }),
          regions: { actions: values, case: values, updates: values },
          title: 'portal.title',
          warnings: new Proxy({}, { get: (_target, key) => `portal-warning-${String(key)}` }),
        };
      },
    }),
}));
vi.mock('@/i18n/routing', () => ({ Link: 'a', usePathname: () => h.pathname }));

import { getMemberPortalContext } from './portal-context';
import PortalLayout from './layout';
import PortalPage from './page';
import PortalDefault from './default';
import CaseSlot from './@case/page';
import CaseDefault from './@case/default';
import ActionsSlot from './@actions/page';
import ActionsDefault from './@actions/default';
import UpdatesSlot from './@updates/page';
import UpdatesDefault from './@updates/default';

describe('member portal request context', () => {
  const expectNoProjections = () => {
    expect(h.cases).not.toHaveBeenCalled();
    expect(h.membership).not.toHaveBeenCalled();
  };

  beforeEach(() => {
    vi.clearAllMocks();
    h.requests = new Map();
    h.neutral = true;
    h.pathname = '/member';
    h.session.mockResolvedValue({
      user: { id: 'member-a', role: 'member', tenantId: 'tenant_ks' },
    });
  });

  it.each(LOCALES)('validates and retains the supported locale %s', async locale => {
    const context = await getMemberPortalContext(locale);
    expect(context.locale).toBe(locale);
    expect(context.canDraft).toBe(true);
    expect(setRequestLocale).toHaveBeenCalledExactlyOnceWith(locale);
    expect(h.session).toHaveBeenCalledTimes(1);
    expect(h.cases).toHaveBeenCalledExactlyOnceWith({
      memberId: 'member-a',
      tenantId: 'tenant_ks',
    });
    expect(h.membership).toHaveBeenCalledExactlyOnceWith({
      memberId: 'member-a',
      tenantId: 'tenant_ks',
    });
  });

  it.each(['', 'de', 'SQ', '../../admin'])(
    'rejects unsupported locale %s before locale setup, identity or projections',
    async locale => {
      await expect(getMemberPortalContext(locale)).rejects.toThrow('notFound');
      expect(setRequestLocale).not.toHaveBeenCalled();
      expect(h.session).not.toHaveBeenCalled();
      expectNoProjections();
    }
  );

  it.each([
    ['member', 'tenant_ks', true, true, false],
    ['user', 'tenant_ks', true, true, false],
    ['agent', 'tenant_ks', true, false, true],
    ['member', 'tenant_mk', true, false, false],
    ['member', 'tenant_ks', false, false, false],
  ] as const)(
    'limits draft access for %s in %s',
    async (role, tenantId, neutral, canDraft, isAgent) => {
      h.neutral = neutral;
      const id = role === 'agent' ? 'agent-a' : 'member-a';
      h.session.mockResolvedValueOnce({ user: { id, role, tenantId } });
      expect(await getMemberPortalContext('sq')).toEqual(
        expect.objectContaining({ canDraft, isAgent })
      );
      expect(h.cases).toHaveBeenCalledExactlyOnceWith({ memberId: id, tenantId });
      expect(h.membership).toHaveBeenCalledExactlyOnceWith({ memberId: id, tenantId });
    }
  );

  it.each([
    { id: 'member-a', role: 'member', tenantId: null },
    { id: '', role: 'member', tenantId: 'tenant_ks' },
    { id: 'member-a', role: 'unknown', tenantId: 'tenant_ks' },
  ])('blocks invalid identity $role before projections', async user => {
    h.session.mockResolvedValueOnce({ user });
    await expect(getMemberPortalContext('sq')).rejects.toThrow('notFound');
    expectNoProjections();
  });

  it.each(['staff', 'admin'])('blocks non-member %s projections', async role => {
    h.session.mockResolvedValueOnce({
      user: { id: `${role}-a`, role, tenantId: 'tenant_ks' },
    });
    await expect(getMemberPortalContext('sq')).rejects.toThrow('redirect:');
    expectNoProjections();
  });

  it('shares one guarded identity and exactly two projections across layout and three slots', async () => {
    const pending = Array.from({ length: 4 }, () => getMemberPortalContext('sq'));
    expect(new Set(pending).size).toBe(1);
    const values = await Promise.all(pending);
    expect(new Set(values).size).toBe(1);
    expect(h.session).toHaveBeenCalledTimes(1);
    expect(h.cases).toHaveBeenCalledExactlyOnceWith({
      memberId: 'member-a',
      tenantId: 'tenant_ks',
    });
    expect(h.membership).toHaveBeenCalledExactlyOnceWith({
      memberId: 'member-a',
      tenantId: 'tenant_ks',
    });
    expect(values[1].caseTask).toBe(values[3].caseTask);
  });

  it('starts no projection while session authorization is pending', async () => {
    let authorize!: (value: unknown) => void;
    h.session.mockReturnValueOnce(
      new Promise(resolve => {
        authorize = resolve;
      })
    );
    const pending = getMemberPortalContext('sq');
    await Promise.resolve();
    expect(h.cases).not.toHaveBeenCalled();
    expect(h.membership).not.toHaveBeenCalled();
    authorize({ user: { id: 'member-a', role: 'member', tenantId: 'tenant_ks' } });
    await pending;
    expect(h.cases).toHaveBeenCalledTimes(1);
    expect(h.membership).toHaveBeenCalledTimes(1);
  });

  it('passes projection rejection to existing region boundaries', async () => {
    h.cases.mockRejectedValueOnce(new Error('cases unavailable'));
    h.membership.mockRejectedValueOnce(new Error('membership unavailable'));
    const context = await getMemberPortalContext('sq');
    await expect(context.caseTask).rejects.toThrow('cases unavailable');
    await expect(context.membershipTask).rejects.toThrow('membership unavailable');
  });

  it('preserves portal-owned next steps and distinct lifecycle warnings', async () => {
    const { copy } = await getMemberPortalContext('sq');
    expect(copy.actions.active_in_grace).toEqual({
      description: 'description',
      label: 'active_in_grace',
      warning: 'portal-warning-active_in_grace',
    });
    expect(copy.actions.active_in_grace.warning).not.toBe(copy.actions.active_in_grace.label);
    const summary = { nextStep: 'team_review', status: 'submitted' } as Parameters<
      typeof copy.caseLabels
    >[0];
    expect(copy.caseLabels(summary).nextStepValue).toBe('portal-next-team_review');
    expect(copy.caseLabels({ ...summary, nextStep: 'external_response' }).nextStepValue).toBe(
      'portal-next-external_response'
    );
  });

  it('wires named slots and hard-recovery defaults to the same context and case promise', async () => {
    const params: Promise<{ locale: string }> = Promise.resolve({ locale: 'sq' });
    const [cases, actions, updates] = await Promise.all([
      CaseSlot({ params }),
      ActionsSlot({ params }),
      UpdatesSlot({ params }),
    ]);
    const layout = await PortalLayout({
      params,
      case: cases,
      actions,
      updates,
      children: PortalPage(),
    });
    const context = await getMemberPortalContext('sq');
    expect(cases.props.children.props.promise).toBe(context.caseTask);
    expect(updates.props.children.props.promise).toBe(context.caseTask);
    expect(actions.props.children.props.promise).toBe(context.membershipTask);
    expect(actions.props.children.props.canDraft).toBe(true);
    expect(layout.type).toBe(PortalPage);
    const ready = layout.props.content;
    expect(ready.props['data-testid']).toBe('member-dashboard-ready');
    expect(ready.props.children.props).toEqual({
      copy: context.copy,
      caseRegion: cases,
      actionsRegion: actions,
      updatesRegion: updates,
    });
    expect(h.session).toHaveBeenCalledTimes(1);
    expect(h.cases).toHaveBeenCalledTimes(1);
    expect(h.membership).toHaveBeenCalledTimes(1);
    expect(CaseDefault).toBe(CaseSlot);
    expect(ActionsDefault).toBe(ActionsSlot);
    expect(UpdatesDefault).toBe(UpdatesSlot);
    expect(PortalDefault).toBe(PortalPage);
    expect(PortalPage()).toBeNull();
    expect(PortalPage({ content: 'portal' })).toBe('portal');
    h.pathname = '/member/documents';
    expect(PortalPage({ content: 'portal' })).toBeNull();
  });

  it('does not carry identity or projection promises into a second request', async () => {
    const first = await getMemberPortalContext('sq');
    h.requests = new Map();
    h.session.mockResolvedValue({
      user: { id: 'member-b', role: 'member', tenantId: 'tenant_mk' },
    });
    const next = await getMemberPortalContext('sq');
    expect(next.caseTask).not.toBe(first.caseTask);
    expect(h.cases).toHaveBeenLastCalledWith({ memberId: 'member-b', tenantId: 'tenant_mk' });
    expect(h.membership).toHaveBeenLastCalledWith({ memberId: 'member-b', tenantId: 'tenant_mk' });
    expect(next.canDraft).toBe(false);
  });

  it.each([null, { user: { id: 'member-a', role: 'member', tenantId: null } }])(
    'rechecks revoked identity on the next request before any new projection',
    async revoked => {
      await getMemberPortalContext('sq');
      h.requests = new Map();
      h.session.mockResolvedValue(revoked);
      await expect(getMemberPortalContext('sq')).rejects.toThrow();
      expect(h.cases).toHaveBeenCalledTimes(1);
      expect(h.membership).toHaveBeenCalledTimes(1);
    }
  );

  it('rechecks neutral-host draft eligibility on a later request', async () => {
    expect((await getMemberPortalContext('sq')).canDraft).toBe(true);
    h.requests = new Map();
    h.neutral = false;
    expect((await getMemberPortalContext('sq')).canDraft).toBe(false);
  });
});
