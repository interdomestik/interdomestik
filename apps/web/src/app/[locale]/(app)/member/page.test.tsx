import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// prettier-ignore
const h = vi.hoisted(() => ({
  cases: vi.fn(async () => []),
  membership: vi.fn(async () => ({ bucket: 'active' })),
  neutralHost: true,
  runtime: vi.fn((_props: unknown) => <div />),
  go: vi.fn(),
  session: vi.fn(async () => ({ user: { id: 'member-1', role: 'member', tenantId: 'tenant_ks' as string | null } })),
  missing: vi.fn(() => { throw new Error('notFound'); }),
}));

// prettier-ignore
vi.mock('next-intl/server', () => ({ getTranslations: vi.fn(async () => { const values = new Proxy({}, { get: (_target, key) => String(key) }); return Object.assign((key: string) => key, { raw: () => ({ actions: values, description: 'description', disclaimer: 'disclaimer', navigation: { cases: 'cases', documents: 'documents', help_now: 'help', label: 'label', membership: 'membership' }, next_steps: new Proxy({}, { get: (_target, key) => `portal-next-${String(key)}` }), regions: { actions: values, case: values, updates: values }, title: 'portal.title', warnings: new Proxy({}, { get: (_target, key) => `portal-warning-${String(key)}` }) }) }); }), setRequestLocale: vi.fn() }));

// prettier-ignore
vi.mock('@interdomestik/domain-member', () => ({ getMemberCaseSummaries: h.cases, getMemberPortalMembership: h.membership }));

vi.mock('next/navigation', () => ({ redirect: h.go, notFound: h.missing }));
vi.mock('next/headers', () => ({ headers: vi.fn(async () => new Headers()) }));
// prettier-ignore
vi.mock('@/app/api/auth/[...all]/neutral-otp-boundary', () => ({ evaluateNeutralOtpHost: vi.fn(() => h.neutralHost) }));
vi.mock('@/lib/tenant/tenant-hosts', () => ({ resolveDefaultPublicTenantId: () => 'tenant_ks' }));
vi.mock('@/lib/auth.server', () => ({ getCachedSession: h.session }));
// prettier-ignore
vi.mock('@/components/shell/session', () => ({ requireSessionOrRedirect: (session: unknown, locale: string) => { if (session) return session; h.go(`/${locale}/login`); throw new Error('redirect'); } }));
// prettier-ignore
vi.mock('@/components/dashboard/member-portal-runtime', () => ({ MemberPortalRuntime: (props: unknown) => h.runtime(props) }));

import DashboardPage from './page';
const page = (locale: 'mk' | 'sq' = 'sq') => DashboardPage({ params: Promise.resolve({ locale }) });
const idle = () => expect([...h.cases.mock.calls, ...h.membership.mock.calls]).toEqual([]);

describe('DashboardPage', () => {
  // prettier-ignore
  beforeEach(() => { vi.clearAllMocks(); h.neutralHost = true; h.session.mockResolvedValue({ user: { id: 'member-1', role: 'member', tenantId: 'tenant_ks' } }); });

  // prettier-ignore
  it('starts projections', async () => { render(await page('mk')); const q = { memberId: 'member-1', tenantId: 'tenant_ks' }; expect(h.cases.mock.calls).toEqual([[q]]); expect(h.membership.mock.calls).toEqual([[q]]); expect(h.runtime).toHaveBeenCalledWith(expect.objectContaining({ canDraft: true })); });

  // prettier-ignore
  it.each([['member','tenant_ks',true,true,false],['user','tenant_ks',true,true,false],['agent','tenant_ks',true,false,true],['member','tenant_mk',true,false,false],['member','tenant_ks',false,false,false]])('limits draft access',async(role,tenantId,neutral,expected,isAgent)=>{
    const id=role==='agent'?'agent-1':'m'; h.neutralHost=neutral; h.session.mockResolvedValueOnce({user:{id,role,tenantId}});
    render(await page());
    expect(h.runtime).toHaveBeenLastCalledWith(expect.objectContaining({canDraft:expected,isAgent})); expect(h.cases).toHaveBeenLastCalledWith({memberId:id,tenantId});
  });

  // prettier-ignore
  it('blocks tenantless', async () => { h.session.mockResolvedValueOnce({ user: { id: 'member-1', role: 'member', tenantId: null } }); await expect(page()).rejects.toThrow('notFound'); expect(h.go).not.toHaveBeenCalled(); idle(); });

  // prettier-ignore
  it('uses one fail-closed session identity for both projections', async () => { h.session.mockResolvedValueOnce({ user: { id: '', role: 'member', tenantId: 'tenant_ks' } }); await expect(page()).rejects.toThrow('notFound'); idle(); });

  // prettier-ignore
  it('blocks unknown actor roles', async () => { h.session.mockResolvedValueOnce({ user: { id: 'member-1', role: 'unknown', tenantId: 'tenant_ks' } }); await expect(page()).rejects.toThrow('notFound'); idle(); });

  // prettier-ignore
  it('passes projection rejection to region boundaries', async () => { h.cases.mockRejectedValueOnce(new Error('cases unavailable')); h.membership.mockRejectedValueOnce(new Error('membership unavailable')); render(await page()); const props = h.runtime.mock.lastCall?.[0] as { caseTask: Promise<unknown>; membershipTask: Promise<unknown> }; await expect(props.caseTask).rejects.toThrow('cases unavailable'); await expect(props.membershipTask).rejects.toThrow('membership unavailable'); });

  // prettier-ignore
  it('uses portal-owned next steps and distinct lifecycle warnings', async () => { render(await page()); const props = h.runtime.mock.lastCall?.[0] as { copy: { actions: Record<string, { label: string; warning: string | null }>; caseLabels: (summary: { nextStep: string; status: string }) => { nextStepValue: string } } }; expect(props.copy.actions.active_in_grace).toEqual({ description: 'description', label: 'active_in_grace', warning: 'portal-warning-active_in_grace' }); expect(props.copy.actions.active_in_grace.warning).not.toBe(props.copy.actions.active_in_grace.label); expect(props.copy.caseLabels({ nextStep: 'team_review', status: 'submitted' }).nextStepValue).toBe('portal-next-team_review'); expect(props.copy.caseLabels({ nextStep: 'external_response', status: 'submitted' }).nextStepValue).toBe('portal-next-external_response'); });

  // prettier-ignore
  it.each(['staff','admin'])('blocks %s projections', async role => { h.go.mockImplementationOnce(() => { throw 0; }); h.session.mockResolvedValueOnce({ user: { id: 'x', role, tenantId: 'tenant_ks' } }); await expect(page()).rejects.toBe(0); idle(); });
});
