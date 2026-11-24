import deCommonMessages from '@/messages/de/common.json';
import deNavMessages from '@/messages/de/nav.json';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ComponentProps } from 'react';
import { toast } from 'sonner';
import { beforeEach, expect, it, vi } from 'vitest';
import { Header } from './header';

const mocks = vi.hoisted(() => ({ push: vi.fn(), saveLocale: vi.fn(), syncLocaleCookie: vi.fn() }));

vi.unmock('next-intl');
vi.mock('@/i18n/routing', () => ({
  useRouter: () => ({ push: mocks.push }),
  Link: ({ locale, onClick, ...props }: ComponentProps<'a'> & { locale?: string }) => (
    <a
      {...props}
      onClick={event => {
        // next-intl's localized Link synchronizes the cookie before invoking onClick.
        if (locale) mocks.syncLocaleCookie(locale);
        onClick?.(event);
      }}
    />
  ),
}));

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    useSession: () => ({ data: { user: { id: 'user-1', role: 'member' } }, isPending: false }),
  },
}));

vi.mock('@/actions/preferred-locale', () => ({ updatePreferredLocale: mocks.saveLocale }));
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

function chooseMacedonian() {
  render(
    <NextIntlClientProvider
      locale="de"
      messages={{ ...deCommonMessages, ...deNavMessages }}
      timeZone="UTC"
    >
      <Header />
    </NextIntlClientProvider>
  );
  const trigger = screen.getByTestId('public-locale-trigger');
  fireEvent.click(trigger);
  fireEvent.click(screen.getByRole('link', { name: 'mk' }));
  return trigger;
}

beforeEach(() => vi.clearAllMocks());

it('saves a signed-in visitor’s chosen locale before navigating', async () => {
  let complete!: (value: { success: true }) => void;
  const result = new Promise<{ success: true }>(resolve => {
    complete = resolve;
  });
  mocks.saveLocale.mockReturnValueOnce(result);

  chooseMacedonian();

  expect(mocks.saveLocale).toHaveBeenCalledExactlyOnceWith({ locale: 'mk' });
  expect(mocks.push).not.toHaveBeenCalled();
  expect(mocks.syncLocaleCookie).not.toHaveBeenCalled();
  complete({ success: true });
  await waitFor(() => expect(mocks.push).toHaveBeenCalledExactlyOnceWith('/', { locale: 'mk' }));
});

it('shows a localized error and stays on the current locale when saving fails', async () => {
  mocks.saveLocale.mockResolvedValueOnce({ success: false, error: 'conflict' });

  const trigger = chooseMacedonian();

  await waitFor(() =>
    expect(toast.error).toHaveBeenCalledWith(deCommonMessages.common.localeSaveError)
  );
  expect(mocks.push).not.toHaveBeenCalled();
  expect(mocks.syncLocaleCookie).not.toHaveBeenCalled();
  expect(trigger).toHaveFocus();
});
