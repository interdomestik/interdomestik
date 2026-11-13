import { render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider, type AbstractIntlMessages } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';

import { OPS_TEST_IDS } from '@/components/ops/testids';
import type { AssignmentTimelineEntry } from '@/features/admin/claims/server/claim-assignment-history';
import type { TimelineEntry } from '@/features/claims/timeline/types';
import { LOCALES } from '@/i18n/locales';

import { ClaimOpsTimeline } from './ClaimOpsTimeline';

vi.unmock('next-intl');
const catalogs = import.meta.glob('../../../../../messages/*/claims.json', {
  eager: true,
  import: 'default',
});
const messagesFor = (locale: string) =>
  catalogs[`../../../../../messages/${locale}/claims.json`] as AbstractIntlMessages;

const status = (id: string, iso: string, from: TimelineEntry['fromStatus']): TimelineEntry => ({
  id,
  fromStatus: from,
  toStatus: 'submitted',
  timestamp: new Date(iso),
  actorRole: 'member',
  note: null,
  isPublic: true,
});
const assignment = (
  id: string,
  iso: string,
  overrides: Partial<AssignmentTimelineEntry> = {}
): AssignmentTimelineEntry => ({
  id,
  kind: 'assigned',
  timestamp: new Date(iso),
  toHandlerName: 'Drita Gashi',
  fromHandlerName: null,
  actorName: 'Arta Admin',
  actorRole: 'admin',
  ...overrides,
});

const entries = [
  status('s1', '2026-11-13T10:00:00Z', null),
  status('s2', '2026-11-13T12:00:00Z', 'draft'),
];
const assignments = [
  assignment('assignment-1', '2026-11-13T11:00:00Z'),
  assignment('assignment-2', '2026-11-13T12:00:00Z', {
    kind: 'unassigned',
    toHandlerName: null,
    fromHandlerName: 'Drita Gashi',
    actorName: null,
  }),
  assignment('assignment-3', '2026-11-13T13:00:00Z', { toHandlerName: null }),
];

function renderTimeline(locale: string, withAssignments = assignments) {
  return render(
    <NextIntlClientProvider locale={locale} messages={messagesFor(locale)} timeZone="UTC">
      <ClaimOpsTimeline
        entries={entries}
        assignments={withAssignments}
        title="History"
        emptyLabel="Empty"
      />
    </NextIntlClientProvider>
  );
}

const titles = () =>
  screen
    .getAllByTestId(OPS_TEST_IDS.TIMELINE.ITEM)
    .map(item => item.querySelector('p')?.textContent);

describe('ClaimOpsTimeline assignment history', () => {
  it.each(LOCALES)('renders assignment events in %s copy, merged by time', locale => {
    const copy = (messagesFor(locale) as { claims: { timeline: Record<string, string> } }).claims
      .timeline;
    renderTimeline(locale);

    const items = screen.getAllByTestId(OPS_TEST_IDS.TIMELINE.ITEM);
    expect(items).toHaveLength(5);
    expect(titles()).toEqual([
      expect.stringContaining('→'),
      copy.assignment_assigned.replace('{name}', 'Drita Gashi'),
      expect.stringContaining('→'),
      copy.assignment_removed,
      copy.assignment_assigned_unnamed,
    ]);
    expect(
      within(items[3]).getByText(copy.assignment_previous.replace('{name}', 'Drita Gashi'))
    ).toBeInTheDocument();
    expect(within(items[1]).getByText('Arta Admin')).toBeInTheDocument();
    expect(within(items[3]).getByText(copy.actor_admin)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/assignment_|\{name\}/);
  });

  it('keeps the status-only history unchanged without assignment events', () => {
    renderTimeline('sq', []);
    expect(screen.getAllByTestId(OPS_TEST_IDS.TIMELINE.ITEM)).toHaveLength(2);
    expect(titles()).toEqual(['Krijuar → Dorëzuar', 'Skicë → Dorëzuar']);
  });
});
