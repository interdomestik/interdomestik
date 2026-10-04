import { act, fireEvent, render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EMPTY_DRAFT } from './free-start-intake-shell/constants';
import { useOrganizerFlow } from './free-start-intake-shell/use-organizer-flow';
import { usePublicIntakeArrival } from './free-start-intake-shell/use-public-intake-arrival';
import { usePublicCategoryIntent } from './free-start-intake-shell/use-public-category-intent';
import type { PublicCategoryIntent } from './free-start-intake-shell/types';

let nextFrame = 0;
let frames: Map<number, FrameRequestCallback>;
let callbacks: FrameRequestCallback[];
const scroll = vi.fn();

function flushFrames() {
  const pending = [...frames.values()];
  frames.clear();
  act(() => pending.forEach(callback => callback(0)));
}

function Harness({
  blocked = false,
  initialCategory,
  recoveryOffer = false,
  recoveryBusy = false,
  intent,
}: {
  blocked?: boolean;
  initialCategory?: 'vehicle' | 'injury';
  recoveryOffer?: boolean;
  recoveryBusy?: boolean;
  intent?: PublicCategoryIntent;
}) {
  const ownership = useRef(false);
  const flow = useOrganizerFlow(initialCategory, ownership);
  const arrival = usePublicIntakeArrival({
    blocked,
    category: flow.selectedCategory,
    ownership,
    recoveryOffer,
    recoveryBusy,
    step: flow.step,
  });
  usePublicCategoryIntent({
    decided: recoveryOffer || recoveryBusy,
    intent,
    resolved: !blocked || recoveryOffer,
    onDecided: arrival.requestDecision,
    onEnter: category => {
      arrival.request(category);
      flow.selectCategory(category);
      flow.setStep('details');
    },
  });
  return (
    <>
      <button
        onClick={() => {
          arrival.request('vehicle');
          flow.selectCategory('vehicle');
          flow.setStep('details');
        }}
      >
        Enter vehicle
      </button>
      <button
        onClick={() => {
          arrival.request('property');
          flow.selectCategory('property');
          flow.setStep('details');
        }}
      >
        Enter property
      </button>
      <button onClick={() => arrival.request(flow.selectedCategory)}>Repeat</button>
      <button
        onClick={() =>
          flow.restoreAnonymousDraft({
            category: 'vehicle',
            draft: { ...EMPTY_DRAFT, summary: 'Restored facts' },
            resumeStep: 'details',
          })
        }
      >
        Resume
      </button>
      <button
        onClick={() => {
          flow.selectCategory('injury');
          flow.setStep('details');
        }}
      >
        Injury
      </button>
      {recoveryOffer ? (
        <section data-testid="anonymous-draft-recovery-offer">
          <h3 id="anonymous-draft-recovery-heading" tabIndex={-1}>
            Recovery choice
          </h3>
          <button disabled={recoveryBusy}>Recovery control</button>
        </section>
      ) : null}
      <h3 ref={flow.stageHeadingRef} tabIndex={-1}>
        Stage {flow.step}
      </h3>
      {flow.step === 'details' ? (
        <div inert={blocked || undefined}>
          <h4 ref={arrival.headingRef} tabIndex={-1}>
            Narrative
          </h4>
          <textarea
            id="free-start-summary"
            aria-label="Narrative"
            value={flow.draft.summary}
            onChange={event => flow.setDraftField('summary', event.target.value)}
          />
        </div>
      ) : null}
    </>
  );
}

describe('public intake arrival ownership', () => {
  beforeEach(() => {
    frames = new Map();
    callbacks = [];
    nextFrame = 0;
    scroll.mockReset();
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((callback: FrameRequestCallback) => {
        callbacks.push(callback);
        frames.set(++nextFrame, callback);
        return nextFrame;
      })
    );
    vi.stubGlobal(
      'cancelAnimationFrame',
      vi.fn((id: number) => frames.delete(id))
    );
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scroll,
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('gives one deliberate entry non-input focus and instant arrival', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Enter vehicle' }));
    expect(screen.getByRole('heading', { name: 'Stage details' })).not.toHaveFocus();
    flushFrames();
    expect(screen.getByRole('heading', { name: 'Narrative' })).toHaveFocus();
    expect(screen.getByLabelText('Narrative')).not.toHaveFocus();
    expect(scroll).toHaveBeenCalledOnce();
    expect(scroll).toHaveBeenCalledWith({ block: 'start', behavior: 'instant' });
  });

  it('never schedules an arrival merely for initial details or ordinary settlement', () => {
    const { rerender } = render(<Harness initialCategory="vehicle" blocked />);
    rerender(<Harness initialCategory="vehicle" />);
    flushFrames();
    expect(scroll).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'Narrative' })).not.toHaveFocus();
  });

  it('preserves focused narrative node, facts and selection on a repeated intent', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Enter vehicle' }));
    flushFrames();
    const field = screen.getByLabelText('Narrative') as HTMLTextAreaElement;
    field.focus();
    fireEvent.change(field, { target: { value: 'Facts already being written' } });
    field.setSelectionRange(3, 8);
    fireEvent.click(screen.getByRole('button', { name: 'Repeat' }));
    flushFrames();
    expect(screen.getByLabelText('Narrative')).toBe(field);
    expect(field).toHaveFocus();
    expect(field).toHaveValue('Facts already being written');
    expect([field.selectionStart, field.selectionEnd]).toEqual([3, 8]);
    expect(scroll).toHaveBeenCalledOnce();
  });

  it.each(['pointerdown', 'keydown', 'input', 'focusin'] as const)(
    'a newer %s interaction cancels even a retained stale callback',
    event => {
      render(<Harness />);
      fireEvent.click(screen.getByRole('button', { name: 'Enter vehicle' }));
      fireEvent(screen.getByLabelText('Narrative'), new Event(event, { bubbles: true }));
      act(() => callbacks[0](0));
      expect(scroll).not.toHaveBeenCalled();
      expect(screen.getByRole('heading', { name: 'Narrative' })).not.toHaveFocus();
    }
  );

  it('consumes a recovery-owned request without replay after recovery settles', () => {
    const { rerender } = render(<Harness blocked />);
    fireEvent.click(screen.getByRole('button', { name: 'Enter vehicle' }));
    rerender(<Harness />);
    flushFrames();
    expect(scroll).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'Narrative' })).not.toHaveFocus();
  });

  it('cancels a scheduled arrival when a recovery offer takes authority', () => {
    const { rerender } = render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Enter vehicle' }));
    rerender(<Harness blocked />);
    act(() => callbacks[0](0));
    rerender(<Harness />);
    flushFrames();
    expect(scroll).not.toHaveBeenCalled();
  });

  it('only the newest entry can arrive; stale cleanup cannot steal its focus', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Enter vehicle' }));
    fireEvent.click(screen.getByRole('button', { name: 'Enter property' }));
    act(() => callbacks[0](0));
    expect(scroll).not.toHaveBeenCalled();
    flushFrames();
    expect(scroll).toHaveBeenCalledOnce();
    expect(screen.getByRole('heading', { name: 'Narrative' })).toHaveFocus();
  });

  it('does not repeat arrival on typing, category-stable rerender or session settlement', () => {
    const { rerender } = render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Enter vehicle' }));
    flushFrames();
    const field = screen.getByLabelText('Narrative');
    field.focus();
    fireEvent.change(field, { target: { value: 'Updated facts' } });
    rerender(<Harness />);
    flushFrames();
    expect(field).toHaveFocus();
    expect(scroll).toHaveBeenCalledOnce();
  });

  it('keeps the existing recovery-resume and injury details heading focus', () => {
    const { unmount } = render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
    expect(screen.getByRole('heading', { name: 'Stage details' })).toHaveFocus();
    expect(screen.getByLabelText('Narrative')).toHaveValue('Restored facts');
    expect(scroll).not.toHaveBeenCalled();
    unmount();
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Injury' }));
    expect(screen.getByRole('heading', { name: 'Stage details' })).toHaveFocus();
    expect(scroll).not.toHaveBeenCalled();
  });

  it('a consumed public intent brings an existing offer into reach without entering facts', () => {
    render(<Harness blocked recoveryOffer intent={{ category: 'vehicle', sequence: 1 }} />);
    flushFrames();
    expect(screen.getByRole('heading', { name: 'Recovery choice' })).toHaveFocus();
    expect(screen.queryByLabelText('Narrative')).toBeNull();
    expect(scroll).toHaveBeenCalledOnce();
  });

  it('an intent consumed during held resume/discard never replays its arrival', () => {
    const intent = { category: 'vehicle' as const, sequence: 1 };
    const { rerender } = render(<Harness blocked recoveryOffer recoveryBusy intent={intent} />);
    rerender(<Harness intent={intent} />);
    flushFrames();
    expect(scroll).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
    expect(screen.getByRole('heading', { name: 'Stage details' })).toHaveFocus();
    expect(screen.getByLabelText('Narrative')).toHaveValue('Restored facts');
    flushFrames();
    expect(scroll).not.toHaveBeenCalled();
  });

  it('a newly busy recovery operation cancels a queued offer arrival', () => {
    const intent = { category: 'vehicle' as const, sequence: 1 };
    const { rerender } = render(<Harness blocked recoveryOffer intent={intent} />);
    rerender(<Harness blocked recoveryOffer recoveryBusy intent={intent} />);
    act(() => callbacks[0](0));
    expect(scroll).not.toHaveBeenCalled();
  });

  it('repeated manual intents preserve focus on a recovery decision control', () => {
    const { rerender } = render(<Harness blocked recoveryOffer />);
    const control = screen.getByRole('button', { name: 'Recovery control' });
    control.focus();
    rerender(<Harness blocked recoveryOffer intent={{ category: 'vehicle', sequence: 1 }} />);
    flushFrames();
    expect(control).toHaveFocus();
    expect(scroll).not.toHaveBeenCalled();
  });

  it('unmount cancels a pending arrival, including a held callback', () => {
    const { unmount } = render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Enter vehicle' }));
    unmount();
    act(() => callbacks[0](0));
    expect(scroll).not.toHaveBeenCalled();
  });
});
