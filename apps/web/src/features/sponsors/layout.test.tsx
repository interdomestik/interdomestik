import { NextIntlClientProvider } from 'next-intl';
import { getMessages, setRequestLocale } from 'next-intl/server';
import { describe, expect, it, vi } from 'vitest';
import { SponsorLayout } from './layout';

vi.mock('next-intl', () => ({ NextIntlClientProvider: () => null }));
vi.mock('next-intl/server', () => ({
  setRequestLocale: vi.fn(),
  getMessages: vi.fn(async () => ({
    sponsors: { title: 'Sponsors' },
    sponsorTasks: { title: 'Tasks' },
    unrelated: { title: 'Unrelated' },
  })),
}));

describe('sponsor layout', () => {
  it('sets the locale and passes only requested message namespaces to the provider', async () => {
    const children = <div>content</div>;
    const element = await SponsorLayout({
      locale: 'en',
      namespaces: ['sponsors', 'sponsorTasks'],
      children,
    });
    expect(setRequestLocale).toHaveBeenCalledWith('en');
    expect(getMessages).toHaveBeenCalledWith({ locale: 'en' });
    expect(vi.mocked(setRequestLocale).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(getMessages).mock.invocationCallOrder[0]
    );
    expect(element.type).toBe(NextIntlClientProvider);
    expect(element.props.messages).toEqual({
      sponsors: { title: 'Sponsors' },
      sponsorTasks: { title: 'Tasks' },
    });
    expect(element.props.children).toBe(children);
  });
});
