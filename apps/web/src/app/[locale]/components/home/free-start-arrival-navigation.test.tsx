import { fireEvent, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import freeStartCopy from '@/messages/en/freeStart.json';
import { DetailsStep } from './free-start-intake-shell/details-step';
import { EMPTY_DRAFT } from './free-start-intake-shell/constants';
import { UrgentAdvice } from './free-start-intake-shell/urgent-advice';
import { PublicEntryPropertyAction } from './public-entry-property-action';
import { PublicEntryVehicleAction } from './public-entry-vehicle-action';
import { takePendingPublicEntryIntent } from './public-entry-intent';

vi.mock('@/i18n/routing', () => ({
  Link: ({
    children,
    scroll: _scroll,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
    scroll?: boolean;
  }) => <a {...props}>{children}</a>,
}));

const copy = freeStartCopy.freeStart;
const translate = (key: string) =>
  key
    .split('.')
    .reduce<unknown>((value, part) => (value as Record<string, unknown>)[part], copy) as string;

function Facts() {
  return (
    <>
      <header data-testid="public-header" />
      <UrgentAdvice selectedCategory="vehicle" t={translate} />
      <DetailsStep
        draft={EMPTY_DRAFT}
        issueIds={[]}
        selectedCategory="vehicle"
        narrativeHeadingRef={createRef()}
        setDraftField={vi.fn()}
        t={translate}
        onBack={vi.fn()}
        onContinue={vi.fn()}
      />
    </>
  );
}

describe('ordinary public arrival and safety navigation', () => {
  beforeEach(() => takePendingPublicEntryIntent());

  it('keeps expanded qualified advice before the narrative and offers optional navigation', () => {
    render(<Facts />);
    const advice = screen.getByTestId('free-start-urgent-advice');
    const narrative = screen.getByLabelText(copy.details.summary);
    expect(advice.compareDocumentPosition(narrative) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(
      0
    );
    expect(advice).toHaveTextContent(copy.urgentAdvice.vehicle.injury);
    expect(advice).toHaveTextContent(copy.urgentAdvice.vehicle.movement);
    expect(advice).toHaveTextContent(copy.urgentAdvice.vehicle.contact);
    const cue = screen.getByRole('link', { name: copy.urgentAdvice.heading });
    expect(cue).toHaveAttribute('href', '#free-start-urgent-advice-heading');
    fireEvent.click(cue);
    expect(screen.getByRole('heading', { name: copy.urgentAdvice.heading })).toHaveFocus();
    fireEvent.click(screen.getByRole('link', { name: copy.details.summary }));
    expect(screen.getByRole('heading', { name: copy.details.summary })).toHaveFocus();
    expect(screen.getByLabelText(copy.details.summary)).toBe(narrative);
    expect(narrative).not.toHaveFocus();
  });

  it('uses the actual sticky header height without changing modified native links', () => {
    render(<Facts />);
    Object.defineProperty(screen.getByTestId('public-header'), 'offsetHeight', { value: 137 });
    const cue = screen.getByRole('link', { name: copy.urgentAdvice.heading });
    fireEvent.click(cue, { ctrlKey: true });
    const heading = screen.getByRole('heading', { name: copy.urgentAdvice.heading });
    expect(heading).not.toHaveFocus();
    fireEvent.click(cue);
    expect(heading).toHaveStyle({ scrollMarginTop: '153px' });
    expect(heading).toHaveFocus();
  });

  it.each([
    { category: 'vehicle', Action: PublicEntryVehicleAction },
    { category: 'property', Action: PublicEntryPropertyAction },
  ] as const)(
    'only ordinary hydrated $category activation emits a public intent',
    ({ category, Action }) => {
      render(<Action label="Report damage" />);
      const anchor = screen.getByRole('link', { name: 'Report damage' });
      expect(anchor).toHaveAttribute('href', '#free-start-intake');
      expect(anchor).toHaveAttribute('data-public-entry-ready', 'true');
      for (const modifier of ['ctrlKey', 'metaKey', 'shiftKey', 'altKey']) {
        fireEvent.click(anchor, { [modifier]: true });
        expect(takePendingPublicEntryIntent()).toBeNull();
      }
      fireEvent.click(anchor);
      expect(takePendingPublicEntryIntent()).toBe(category);
    }
  );
});
