import { render } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';

import messages from '@/messages/en/freeStart.json';
import { SavedDraftList } from './saved-draft-list';
import type { DraftSaveState, SavedDraft } from './types';

vi.unmock('next-intl');
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const saved: SavedDraft = {
  category: 'vehicle',
  clientRequestId: '11111111-1111-4111-8111-111111111111',
  counterparty: 'Insurer',
  createdAt: '2026-10-06T12:00:00.000Z',
  desiredOutcome: 'repair',
  id: '22222222-2222-4222-8222-222222222222',
  incidentDate: '2026-10-06',
  issueType: 'collision',
  resumeStep: 'preview',
  summary: 'Synthetic vehicle collision.',
  updatedAt: '2026-10-06T12:00:00.000Z',
  version: 1,
};

function manager(state: DraftSaveState, items: SavedDraft[]) {
  return (
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <button type="button">Another control</button>
      <SavedDraftList
        items={items}
        nextCursor={null}
        onDelete={vi.fn()}
        onLoadMore={vi.fn()}
        onResume={vi.fn()}
        state={state}
      />
    </NextIntlClientProvider>
  );
}

describe('saved draft manager focus after asynchronous loading', () => {
  it.each([
    { label: 'empty', items: [] },
    { label: 'populated', items: [saved] },
  ])('focuses the first ready $label heading after loading', ({ items }) => {
    const view = render(manager('loading', []));
    expect(view.queryByRole('heading', { name: 'Your saved drafts' })).toBeNull();

    view.rerender(manager('idle', items));

    expect(view.getByRole('heading', { name: 'Your saved drafts' })).toHaveFocus();
  });

  it('keeps deliberate focus when a ready manager reloads or its items change', () => {
    const view = render(manager('idle', []));
    expect(view.getByRole('heading', { name: 'Your saved drafts' })).toHaveFocus();
    const other = view.getByRole('button', { name: 'Another control' });
    other.focus();

    view.rerender(manager('loading', []));
    expect(other).toHaveFocus();
    view.rerender(manager('idle', [saved]));
    expect(other).toHaveFocus();
    view.rerender(manager('loading', [saved]));
    expect(other).toHaveFocus();
    view.rerender(manager('idle', [{ ...saved, version: 2 }]));
    expect(other).toHaveFocus();
  });
});
