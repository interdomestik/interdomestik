import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ROLES } from '@interdomestik/shared-auth';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import messages from '@/messages/en/sponsors.json';
import { context, roster, sponsor, term } from './test-fixtures';
import { SponsorPage } from './pages';
import { SponsorRoster } from './roster';
import { TermControls } from './term-controls';
import type { SponsorArea } from './context.core';

const mocks = vi.hoisted(() => ({
  context: vi.fn(),
  list: vi.fn(),
  roster: vi.fn(),
  gate: vi.fn(),
}));
vi.mock('@/lib/tenant-authority.server', () => ({ authorizeSessionTenant: vi.fn() }));
vi.mock('@/app/[locale]/(agent)/agent/_layout.core', () => ({ getAgentTier: vi.fn() }));
vi.mock('./context.core', async original => ({
  ...(await original<typeof import('./context.core')>()),
  sponsorContext: mocks.context,
}));
vi.mock('./data.core', () => ({
  companyLeads: async () => [],
  sponsorUploadEnabled: mocks.gate,
  termOptions: async () => ({ plans: [], entities: [] }),
}));
vi.mock('./actions', () => ({ sponsorAction: vi.fn() }));
vi.mock('@interdomestik/domain-membership-billing/sponsors/roster-view', () => ({
  listSponsorsForActor: mocks.list,
  readSponsorRoster: mocks.roster,
}));
vi.mock('@interdomestik/domain-membership-billing/sponsors/sponsor-jobs', () => ({
  sponsorCredentialCheck: () => vi.fn(),
}));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NOT_FOUND');
  },
}));
vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => translate),
  getMessages: async () => messages,
  getLocale: async () => 'en',
  setRequestLocale: vi.fn(),
}));
vi.mock('next-intl', () => ({
  useTranslations: () => translate,
  NextIntlClientProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('@/i18n/routing', () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock('@/features/sponsor-tasks/sponsor-tasks-link', () => ({
  SponsorTasksLink: () => <span>sponsor-tasks</span>,
}));

function translate(key: string, values: Record<string, string | number> = {}): string {
  let result: unknown = messages.sponsors;
  for (const part of key.split('.'))
    result = result && typeof result === 'object' ? Reflect.get(result, part) : undefined;
  if (typeof result !== 'string') throw new Error(`Missing translation: ${key}`);
  return result.replace(/\{(\w+)\}/gu, (_, name: string) => String(values[name] ?? name));
}

// Resolve async server children just as the RSC renderer does, retaining client elements.
async function resolveServer(node: React.ReactNode): Promise<React.ReactNode> {
  const React = await import('react');
  if (Array.isArray(node)) return Promise.all(node.map(resolveServer));
  if (!React.isValidElement<{ children?: React.ReactNode }>(node)) return node;
  if (typeof node.type === 'function' && node.type.constructor.name === 'AsyncFunction') {
    const component = node.type as (props: object) => Promise<React.ReactNode>;
    return resolveServer(await component(node.props));
  }
  if (node.props.children)
    return React.cloneElement(node, {}, await resolveServer(node.props.children));
  return node;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.context.mockResolvedValue(context);
  mocks.list.mockResolvedValue([sponsor]);
  mocks.roster.mockResolvedValue({ ok: true, value: roster });
  mocks.gate.mockResolvedValue(false);
});

describe('sponsor surfaces', () => {
  it('sets the route locale before loading context or translations', async () => {
    await SponsorPage({ area: 'staff', params: Promise.resolve({ locale: 'en' }) });
    expect(setRequestLocale).toHaveBeenCalledWith('en');
    const [localeCall] = vi.mocked(setRequestLocale).mock.invocationCallOrder;
    expect(localeCall).toBeLessThan(mocks.context.mock.invocationCallOrder[0]);
    expect(localeCall).toBeLessThan(vi.mocked(getTranslations).mock.invocationCallOrder[0]);
    expect(getTranslations).toHaveBeenCalledWith({ locale: 'en', namespace: 'sponsors' });
  });
  it('renders only roster identities, three statuses, counts, and the left-company marker', async () => {
    render(await SponsorRoster({ roster, uploadEnabled: false, locale: 'en' }));
    expect(screen.getByText('3 of 10 seats used')).toBeInTheDocument();
    for (const label of ['Registered', 'Awaiting employee', 'Left the programme']) {
      expect(screen.getByText(label)).toBeInTheDocument();
      expect(screen.getByText(`${label}: 1`)).toBeInTheDocument();
    }
    expect(screen.getByText('Left the company')).toBeInTheDocument();
    expect(screen.getByText('roster1@example.com')).toBeInTheDocument();
    expect(screen.getByText(/cannot be reassigned/)).toBeInTheDocument();
    expect(screen.getByText(/List upload is not enabled/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Employee CSV file')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Mark as left the company' })).toHaveLength(2);
  });
  it('exposes upload only for an effective term with the switch enabled', async () => {
    const view = render(await SponsorRoster({ roster, uploadEnabled: true, locale: 'en' }));
    expect(screen.getByLabelText('Employee CSV file')).toHaveAttribute('accept', '.csv,text/csv');
    view.unmount();
    render(
      await SponsorRoster({
        roster: { ...roster, term: { ...roster.term, effective: false } },
        uploadEnabled: true,
        locale: 'en',
      })
    );
    expect(screen.queryByLabelText('Employee CSV file')).not.toBeInTheDocument();
    expect(screen.getByText('Approve a revision before uploading employees.')).toBeInTheDocument();
  });
  it('explains why creators cannot approve or terminate', async () => {
    render(
      await TermControls({
        sponsorId: sponsor.sponsorId,
        term: roster.term,
        terms: sponsor.terms,
        actor: { ...context.actor, userId: 'creator' },
        locale: 'en',
      })
    );
    expect(screen.getByRole('button', { name: 'Record decision' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Terminate term' })).toBeDisabled();
    expect(screen.getAllByText(/Another staff member must decide/)).toHaveLength(2);
  });
  it('enables independent staff decisions and hides staff actions from office agents', async () => {
    const view = render(
      await TermControls({
        sponsorId: sponsor.sponsorId,
        term: roster.term,
        terms: sponsor.terms,
        actor: context.actor,
        locale: 'en',
      })
    );
    expect(screen.getByRole('button', { name: 'Record decision' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Terminate term' })).toBeEnabled();
    view.unmount();
    render(
      await TermControls({
        sponsorId: sponsor.sponsorId,
        term: roster.term,
        terms: sponsor.terms,
        actor: { ...context.actor, role: ROLES.agent, agentTier: 'office' },
        locale: 'en',
      })
    );
    expect(screen.queryByRole('button', { name: 'Record decision' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Terminate term' })).not.toBeInTheDocument();
  });
  it.each(['agent', 'admin', 'staff'] as SponsorArea[])(
    'renders ready markers at all %s page levels',
    async area => {
      const role =
        area === 'agent' ? ROLES.agent : area === 'admin' ? ROLES.branch_manager : ROLES.staff;
      mocks.context.mockResolvedValue({
        ...context,
        actor: { ...context.actor, role, agentTier: 'office' },
      });
      for (const ids of [
        {},
        { sponsorId: sponsor.sponsorId },
        { sponsorId: sponsor.sponsorId, termId: term?.termId },
      ]) {
        const element = await SponsorPage({
          area,
          params: Promise.resolve({ locale: 'en', ...ids }),
        });
        const view = render(await resolveServer(element));
        const suffix = 'termId' in ids ? '-roster' : 'sponsorId' in ids ? '-detail' : '';
        expect(screen.getByTestId(`${area}-sponsors${suffix}-page-ready`)).toBeInTheDocument();
        const tasksLink = screen.queryByText('sponsor-tasks');
        expect(Boolean(tasksLink)).toBe(area !== 'agent' && suffix === '');
        view.unmount();
      }
    }
  );
  it('refuses missing authority, wrong area and mismatched term without revealing data', async () => {
    mocks.context.mockResolvedValue(null);
    await expect(
      SponsorPage({ area: 'staff', params: Promise.resolve({ locale: 'en' }) })
    ).rejects.toThrow('NOT_FOUND');
    expect(mocks.list).not.toHaveBeenCalled();
    mocks.context.mockResolvedValue(context);
    await expect(
      SponsorPage({ area: 'agent', params: Promise.resolve({ locale: 'en' }) })
    ).rejects.toThrow('NOT_FOUND');
    await expect(
      SponsorPage({
        area: 'staff',
        params: Promise.resolve({ locale: 'en', sponsorId: sponsor.sponsorId, termId: 'foreign' }),
      })
    ).rejects.toThrow('NOT_FOUND');
    expect(mocks.roster).not.toHaveBeenCalled();
  });
});
