import enAcceptance from '@/messages/en/legal-acceptance.json';
import enSettings from '@/messages/en/settings.json';
import mkAcceptance from '@/messages/mk/legal-acceptance.json';
import mkSettings from '@/messages/mk/settings.json';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { Activity } from 'react';
import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import { MemberAcceptanceForm } from './member-acceptance-form';

const mocks = vi.hoisted(() => ({
  replaceRoute: vi.fn(),
  saveLocale: vi.fn().mockResolvedValue('saved'),
}));

vi.unmock('next-intl');
vi.mock('@/actions/privacy/accept-legal-documents', () => ({ acceptLegalDocuments: vi.fn() }));
vi.mock('@/hooks/use-save-preferred-locale', () => ({
  useSavePreferredLocale: () => mocks.saveLocale,
}));
vi.mock('@/lib/auth-client', () => ({ authClient: { signOut: vi.fn() } }));
vi.mock('@/lib/auth/logout', () => ({ signOutAndRedirectToLogin: vi.fn() }));
vi.mock('@/i18n/routing', () => ({
  getPathname: ({ href, locale }: { href: string; locale: string }) => `/${locale}${href}`,
  usePathname: () => '/member',
  useRouter: () => ({ replace: mocks.replaceRoute }),
}));

const fixture = {
  en: {
    messages: { ...enAcceptance, ...enSettings },
    terms: 'English terms',
    notice: 'English privacy notice',
  },
  mk: {
    messages: { ...mkAcceptance, ...mkSettings },
    terms: 'Македонски услови',
    notice: 'Известување за приватност',
  },
};

function Acceptance({ locale }: Readonly<{ locale: keyof typeof fixture }>) {
  const { messages, terms, notice } = fixture[locale];
  return (
    <NextIntlClientProvider locale={locale} messages={messages} timeZone="Europe/Skopje">
      <MemberAcceptanceForm
        formToken={`signed-${locale}`}
        locale={locale}
        texts={[
          { kind: 'terms', version: 'v1', blocks: [{ key: 'title', text: terms }] },
          { kind: 'privacy_notice', version: 'v1', blocks: [{ key: 'title', text: notice }] },
        ]}
        pendingKinds={[]}
      />
    </NextIntlClientProvider>
  );
}

function SoftNavigation({ english = false }: Readonly<{ english?: boolean }>) {
  return (
    <>
      {english && <Acceptance locale="en" />}
      <Activity mode={english ? 'hidden' : 'visible'}>
        <Acceptance locale="mk" />
      </Activity>
    </>
  );
}

beforeAll(() => {
  Object.assign(Element.prototype, {
    hasPointerCapture: () => false,
    releasePointerCapture: () => undefined,
    scrollIntoView: () => undefined,
  });
});

afterEach(() => vi.unstubAllGlobals());

it('renders one pair of documents when the member switches from Macedonian to English', async () => {
  const user = userEvent.setup();
  const { rerender } = render(<SoftNavigation />);
  // Next.js Cache Components retains the previous locale in a hidden Activity on a soft switch.
  mocks.replaceRoute.mockImplementation(() => rerender(<SoftNavigation english />));
  const replaceDocument = vi.fn(() => rerender(<Acceptance locale="en" />));
  vi.stubGlobal('location', { replace: replaceDocument });

  expect(screen.getByTestId('legal-document-terms')).toHaveTextContent(fixture.mk.terms);
  expect(screen.getByTestId('legal-document-privacy_notice')).toHaveTextContent(fixture.mk.notice);
  await user.click(screen.getByRole('combobox'));
  await user.click(screen.getByRole('option', { name: /English/u }));
  await screen.findByText(fixture.en.terms);

  expect(screen.getAllByTestId('legal-document-terms')).toHaveLength(1);
  expect(screen.getByTestId('legal-document-privacy_notice')).toHaveTextContent(fixture.en.notice);
  expect(screen.getAllByTestId('acceptance-step-ready')).toHaveLength(1);
  expect(mocks.saveLocale).toHaveBeenCalledExactlyOnceWith('en');
  expect(replaceDocument).toHaveBeenCalledExactlyOnceWith('/en/member');
});
