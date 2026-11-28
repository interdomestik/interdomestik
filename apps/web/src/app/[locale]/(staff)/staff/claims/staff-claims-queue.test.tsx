import { formatPilotDate } from '@/lib/utils/date';
import enCatalog from '@/messages/en/agent-claims.json';
import type { StaffClaimsListItem } from '@interdomestik/domain-claims';
import { render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { StaffClaimsQueue } from './staff-claims-queue';
import { StaffClaimsRow } from './staff-claims-row';

vi.mock('@/i18n/routing', () => ({
  Link: ({
    children,
    href,
    prefetch: _prefetch,
    ...props
  }: Readonly<{ children: ReactNode; href: string; prefetch?: boolean }>) => (
    <a data-soft-navigation="" href={href} {...props}>
      {children}
    </a>
  ),
}));
vi.mock('@/components/dashboard/claims/claim-status-badge', () => ({
  ClaimStatusBadge: ({ status }: Readonly<{ status: string | null }>) => (
    <span data-testid="claim-status-badge">{status}</span>
  ),
}));

// The shared setup mocks next-intl; the queue copy comes from the real catalogue here.
const { createTranslator } = await vi.importActual<typeof import('next-intl')>('next-intl');
const tClaims = createTranslator({
  locale: 'en',
  messages: enCatalog,
  namespace: 'agent-claims.claims',
}) as unknown as (key: string, values?: Record<string, string | number>) => string;

const queueClaim: StaffClaimsListItem = {
  id: 'claim-1',
  claimNumber: null,
  companyName: null,
  title: 'Rast',
  status: 'verification',
  stageLabel: 'Verification',
  updatedAt: '2026-09-27T22:30:00.000Z',
  memberName: 'Anëtar',
  memberNumber: null,
  staffId: null,
  isDiasporaOrigin: false,
  diasporaCountry: null,
};

function renderQueue(
  options: Readonly<{
    claims?: StaffClaimsListItem[];
    grouped?: boolean;
    hasActiveFilters?: boolean;
    locale?: string;
  }> = {}
) {
  const locale = options.locale ?? 'en';
  return render(
    <StaffClaimsQueue
      claims={options.claims ?? [queueClaim]}
      getGroup={() => (options.grouped ? 'unassigned' : null)}
      hasActiveFilters={options.hasActiveFilters ?? false}
      locale={locale}
      renderRow={(claim, heading) => (
        <StaffClaimsRow
          key={claim.id}
          attention={null}
          claim={claim}
          currentStaffId="staff-1"
          heading={heading}
          locale={locale}
          tClaims={tClaims}
        />
      )}
      tClaims={tClaims}
    />
  );
}

describe('StaffClaimsQueue', () => {
  it('uses group h2s and claim h3s in the grouped staff queue', () => {
    renderQueue({ grouped: true });

    const group = screen.getByRole('region', { name: 'Unassigned cases' });
    expect(within(group).getByRole('heading', { level: 2 })).toBe(
      screen.getByTestId('staff-claims-group-unassigned')
    );
    const row = within(group).getByRole('listitem');
    expect(within(row).getByRole('heading', { level: 3, name: 'Rast' })).toContainElement(
      screen.getByTestId('staff-claims-view')
    );
  });

  it('uses claim h2s in the flat branch-manager queue', () => {
    renderQueue();

    const queue = within(screen.getByTestId('staff-claims-queue'));
    const row = within(queue.getByRole('listitem'));
    const heading = row.getByRole('heading', { level: 2, name: 'Rast' });
    expect(queue.getAllByRole('heading', { level: 2 })).toEqual([heading]);
    expect(queue.queryByRole('heading', { level: 3 })).not.toBeInTheDocument();
  });

  it('shows the updated date in the pilot time zone and format', () => {
    renderQueue({ locale: 'sq' });

    const row = within(screen.getByTestId('staff-claims-row'));
    const pilotDate = formatPilotDate(queueClaim.updatedAt, 'sq', '');
    expect(row.getByText(pilotDate, { selector: 'dd' })).toHaveTextContent('28.09.2026');
  });

  it.each([
    ['Intake', 'Intake'],
    ['', 'Unavailable'],
  ])('shows the stage label (%s) instead of a badge when status is missing', (stage, text) => {
    renderQueue({ claims: [{ ...queueClaim, status: null, stageLabel: stage }] });

    const row = within(screen.getByTestId('staff-claims-row'));
    expect(row.queryByTestId('claim-status-badge')).not.toBeInTheDocument();
    expect(row.getByText(text, { selector: 'dd span' })).toBeVisible();
  });

  it('offers a native, localized Clear filters link when a filtered queue is empty', () => {
    renderQueue({ claims: [], hasActiveFilters: true });

    const empty = within(screen.getByTestId('staff-claims-empty'));
    expect(empty.getByText('No claims match the current filters')).toBeVisible();
    const clear = empty.getByRole('link', { name: 'Clear filters' });
    expect(clear).toHaveAttribute('href', '/en/staff/claims');
    // A full load resets the search draft along with the filters; a soft navigation would not.
    expect(clear).not.toHaveAttribute('data-soft-navigation');
  });

  it('shows the default empty copy without a Clear filters link', () => {
    renderQueue({ claims: [] });

    expect(screen.getByTestId('staff-claims-empty')).toHaveTextContent('No claims in queue');
    expect(screen.queryByRole('link', { name: 'Clear filters' })).not.toBeInTheDocument();
  });
});
