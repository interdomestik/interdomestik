import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HelpNowExperience } from './help-now-experience';

const hoisted = vi.hoisted(() => ({ trackEventMock: vi.fn() }));

vi.mock('@/lib/analytics', () => ({ trackEvent: hoisted.trackEventMock }));
vi.mock('./offline', () => ({ saveTripModePackForOffline: vi.fn() }));

const EVIDENCE_KEY = 'interdomestik.helpNow.evidenceBundle.v1';
const EN_LINK = 'Organize incident details';
const SQ_LINK = 'Organizo të dhënat e ngjarjes';
const MK_LINK = 'Организирај ги податоците за настанот';
const SR_LINK = 'Organizuj podatke o događaju';
const LOCALE_CASES = [
  { locale: 'en', countryLabel: 'Trip country', link: EN_LINK, country: 'XK' },
  { locale: 'sq', countryLabel: 'Shteti i udhëtimit', link: SQ_LINK, country: 'XK' },
  { locale: 'mk', countryLabel: 'Земја на патување', link: MK_LINK, country: 'MK' },
  { locale: 'sr', countryLabel: 'Zemlja putovanja', link: SR_LINK, country: 'XK' },
] as const;
const LEFTOVER_ENGLISH =
  /Trip country|Access zone|L2|Signed packs|Evidence Coach|Trip Mode|No file selected|Generate local preview/;

function getOnlyContinuation(name: string): HTMLElement {
  const links = screen.getAllByTestId('help-now-continue');
  expect(links).toHaveLength(1);
  expect(screen.getByRole('link', { name })).toBe(links[0]);
  return links[0] as HTMLElement;
}

describe('Help Now continuation', () => {
  beforeEach(() => {
    hoisted.trackEventMock.mockClear();
    localStorage.clear();
    sessionStorage.clear();
  });

  it.each(LOCALE_CASES)(
    'offers one localized native continuation in $locale',
    ({ locale, countryLabel, link, country }) => {
      render(<HelpNowExperience locale={locale} />);

      expect(screen.getByLabelText(countryLabel)).toHaveValue(country);
      const continuation = getOnlyContinuation(link);
      expect(continuation.tagName).toBe('A');
      expect(continuation).toHaveAttribute('href', `/${locale}/#free-start-intake`);
      expect(continuation).toHaveAccessibleDescription();
      if (locale !== 'en') {
        expect(document.body.textContent).not.toMatch(LEFTOVER_ENGLISH);
      }
      expect(document.body.textContent).not.toMatch(/reviewer|signed off|Reviewed country packs/i);
    }
  );

  it('keeps one continuation for dark and accepted packs, independent of preview', async () => {
    const user = userEvent.setup();
    render(<HelpNowExperience locale="en" />);

    expect(screen.queryByTestId('help-now-generate-pack')).not.toBeInTheDocument();
    expect(getOnlyContinuation(EN_LINK)).toHaveAttribute('href', '/en/#free-start-intake');

    await user.selectOptions(screen.getByLabelText('Trip country'), 'MK');
    expect(screen.getByTestId('help-now-generate-pack')).toBeInTheDocument();
    expect(getOnlyContinuation(EN_LINK)).toHaveAttribute('href', '/en/#free-start-intake');

    await user.click(screen.getByTestId('help-now-generate-pack'));
    expect(screen.getByText(/Local preview ready on this device/)).toHaveTextContent(
      'Trip country: North Macedonia'
    );
    expect(getOnlyContinuation(EN_LINK)).toHaveAttribute('href', '/en/#free-start-intake');
  });

  it('keeps the copy locale independent from the selected trip country', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<HelpNowExperience locale="sq" />);

    await user.selectOptions(screen.getByLabelText('Shteti i udhëtimit'), 'MK');
    expect(screen.getByText('Udhëzimet për vendin janë të disponueshme')).toBeInTheDocument();
    expect(getOnlyContinuation(SQ_LINK)).toHaveAttribute('href', '/sq/#free-start-intake');
    unmount();

    render(<HelpNowExperience locale="mk" />);
    await user.selectOptions(screen.getByLabelText('Земја на патување'), 'XK');
    expect(screen.getAllByText('Упатствата за земјата сè уште не се достапни')).toHaveLength(2);
    expect(getOnlyContinuation(MK_LINK)).toHaveAttribute('href', '/mk/#free-start-intake');
  });

  it('builds the link from the validated content locale only', () => {
    render(<HelpNowExperience locale="de" />);

    expect(getOnlyContinuation(EN_LINK)).toHaveAttribute('href', '/en/#free-start-intake');
  });

  it('keeps activation native and transfers no checklist, file or country state', async () => {
    const user = userEvent.setup();
    render(<HelpNowExperience locale="en" />);
    await user.click(screen.getByTestId('help-now-checklist-0'));
    const file = new File(['local'], 'scene.jpg', { type: 'image/jpeg' });
    await user.upload(screen.getByTestId('help-now-shot-0'), file);
    await user.selectOptions(screen.getByLabelText('Trip country'), 'AL');

    const continuation = getOnlyContinuation(EN_LINK);
    expect(continuation).toHaveAttribute('href', '/en/#free-start-intake');
    expect(continuation).not.toHaveAttribute('target');
    expect(continuation).toHaveAccessibleDescription(
      /starts separately.*sends nothing.*checklist, photo notes and country stay here.*no claim, account or contact request is created/
    );
    continuation.focus();
    expect(continuation).toHaveFocus();

    const storedEvidence = localStorage.getItem(EVIDENCE_KEY);
    const trackedCalls = hoisted.trackEventMock.mock.calls.length;
    const prevented: boolean[] = [];
    // Record app-level cancellation, then stop jsdom navigation after every app handler ran.
    const observe = (event: Event) => {
      prevented.push(event.defaultPrevented);
      event.preventDefault();
    };
    window.addEventListener('click', observe);
    window.addEventListener('auxclick', observe);
    try {
      fireEvent.click(continuation);
      fireEvent.click(continuation, { ctrlKey: true });
      fireEvent.click(continuation, { metaKey: true });
      fireEvent.click(continuation, { shiftKey: true });
      fireEvent(
        continuation,
        new MouseEvent('auxclick', { bubbles: true, cancelable: true, button: 1 })
      );
    } finally {
      window.removeEventListener('click', observe);
      window.removeEventListener('auxclick', observe);
    }

    expect(prevented).toEqual([false, false, false, false, false]);
    expect(hoisted.trackEventMock).toHaveBeenCalledTimes(trackedCalls);
    expect(localStorage.getItem(EVIDENCE_KEY)).toBe(storedEvidence);
    expect(sessionStorage).toHaveLength(0);
  });
});
