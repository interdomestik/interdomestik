import { vi } from 'vitest';

const h = vi.hoisted(() => ({
  requests: new Map<unknown, Map<string, unknown>>(),
  session: vi.fn(),
  cases: vi.fn(async () => []),
  membership: vi.fn(async () => ({
    bucket: 'active',
    currentPeriodEnd: new Date('2026-12-31T00:00:00.000Z'),
    grantsNewCaseAccess: true,
  })),
  accepted: true,
  neutral: true,
  pathname: '/member',
}));
export const portalMocks = h;

vi.mock('react', async importOriginal => ({
  ...(await importOriginal<typeof import('react')>()),
  cache: (fn: (locale: string) => unknown) => (locale: string) => {
    if (!h.requests.has(fn)) h.requests.set(fn, new Map());
    const request = h.requests.get(fn)!;
    if (!request.has(locale)) request.set(locale, fn(locale));
    return request.get(locale);
  },
}));
vi.mock('@/lib/privacy/require-member-acceptance', () => ({
  requireAdmittedMember: async () => {
    const session = await h.session();
    if (!session?.user.tenantId) return { ok: false, failure: { code: 'UNAUTHORIZED' } };
    if (!h.accepted) {
      return { ok: false, failure: { code: 'acceptance_required' }, missing: [{ kind: 'terms' }] };
    }
    return { ok: true, authorized: { session, authority: { userId: session.user.id } } };
  },
}));
vi.mock('@/components/privacy/member-acceptance-step', () => ({
  MemberAcceptanceStep: () => null,
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
          membership_status: new Proxy(
            { statuses: values },
            { get: (target, key) => (key === 'statuses' ? target.statuses : String(key)) }
          ),
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

export const own = (memberId: string) => ({ authority: { userId: memberId }, memberId });

export function admitted<T extends { ok: boolean }>(context: T): Extract<T, { ok: true }> {
  if (context.ok) return context as Extract<T, { ok: true }>;
  throw new Error('Expected portal admission');
}

export function resetPortalMocks() {
  vi.clearAllMocks();
  h.requests = new Map();
  h.accepted = true;
  h.neutral = true;
  h.pathname = '/member';
  h.session.mockResolvedValue({
    user: { id: 'member-a', role: 'member', tenantId: 'tenant_ks' },
  });
}
