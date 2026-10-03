import type { MessageWithSender } from '@/actions/messages';
import enMessaging from '@/messages/en/messaging.json';
import mkMessaging from '@/messages/mk/messaging.json';
import sqMessaging from '@/messages/sq/messaging.json';
import srMessaging from '@/messages/sr/messaging.json';
import { render } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ComponentProps } from 'react';
import { MessagingPanel } from './messaging-panel';

// The shipped catalogs already wrap the messaging namespace, so they go straight to the provider.
// Only the action transport is ever mocked by the suites using this helper.
export const catalogs = {
  en: enMessaging,
  mk: mkMessaging,
  sq: sqMessaging,
  sr: srMessaging,
};

export type PanelLocale = keyof typeof catalogs;
export type PanelProps = ComponentProps<typeof MessagingPanel>;

export const copy = enMessaging.messaging;

export const STAFF_USER: PanelProps['currentUser'] = {
  id: 'staff-1',
  name: 'Staff One',
  image: null,
  role: 'staff',
};

export function buildMessage(overrides: Partial<MessageWithSender> = {}): MessageWithSender {
  return {
    id: 'msg-1',
    claimId: 'claim-1',
    senderId: 'member-1',
    content: 'Member asked about the case',
    isInternal: false,
    readAt: null,
    createdAt: new Date('2026-03-01T10:00:00.000Z'),
    sender: { id: 'member-1', name: 'Member One', image: null, role: 'user' },
    ...overrides,
  };
}

export function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  let reject: (reason?: unknown) => void = () => {};
  const promise = new Promise<T>((resolveFn, rejectFn) => {
    resolve = resolveFn;
    reject = rejectFn;
  });

  return { promise, reject, resolve };
}

function wrap(props: PanelProps, locale: PanelLocale) {
  return (
    <NextIntlClientProvider locale={locale} messages={catalogs[locale]} timeZone="UTC">
      <MessagingPanel {...props} />
    </NextIntlClientProvider>
  );
}

export function renderPanel(props: PanelProps, options: { locale?: PanelLocale } = {}) {
  const locale = options.locale ?? 'en';
  const result = render(wrap(props, locale));

  return {
    ...result,
    rerenderPanel: (next: PanelProps, nextLocale: PanelLocale = locale) =>
      result.rerender(wrap(next, nextLocale)),
  };
}
