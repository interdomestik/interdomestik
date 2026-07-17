import { describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';

const hoisted = vi.hoisted(() => ({
  getMessagesMock: vi.fn(async () => ({
    common: { loading: 'Loading' },
    pricing: { title: 'Pricing' },
    entityDisclosure: {
      title: 'Entity',
      contractingCompany: 'Company',
      governingLaw: 'Law',
      unavailableTitle: 'Unavailable',
      unavailableBody: 'Try again',
    },
  })),
  providerMock: vi.fn(
    ({ children }: { children: ReactNode; messages?: Record<string, unknown> }) => children
  ),
  setRequestLocaleMock: vi.fn(),
}));

vi.mock('next-intl/server', () => ({
  getMessages: hoisted.getMessagesMock,
  setRequestLocale: hoisted.setRequestLocaleMock,
}));

vi.mock('next-intl', () => ({
  NextIntlClientProvider: hoisted.providerMock,
}));
vi.mock('next-intl/navigation', () => ({ createNavigation: () => ({}) }));
vi.mock('next-intl/routing', () => ({ defineRouting: (config: unknown) => config }));

import SiteLayout from './_core.entry';

describe('SiteLayout i18n initialization', () => {
  it('sets request locale before loading messages', async () => {
    const result = await SiteLayout({
      children: null,
      params: Promise.resolve({ locale: 'en' }),
    });

    expect(hoisted.setRequestLocaleMock).toHaveBeenCalledWith('en');
    expect(hoisted.getMessagesMock).toHaveBeenCalledTimes(1);
    expect(hoisted.setRequestLocaleMock.mock.invocationCallOrder[0]).toBeLessThan(
      hoisted.getMessagesMock.mock.invocationCallOrder[0]
    );
    expect(result.props.messages).toMatchObject({
      entityDisclosure: {
        title: 'Entity',
        contractingCompany: 'Company',
        governingLaw: 'Law',
        unavailableTitle: 'Unavailable',
        unavailableBody: 'Try again',
      },
    });
  });
});
