import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import { LOCALES } from '@/i18n/locales';
import { toRelativeTimeLocaleTag } from '@/lib/utils/relative-time';
import { NotificationItem } from './notification-item';

vi.unmock('next-intl');
vi.mock('@/i18n/routing', () => ({ Link: 'a', useRouter: () => ({ push: vi.fn() }) }));

describe('notification relative times', () => {
  it.each(LOCALES)('uses locale relative-time text in %s', locale => {
    render(
      <NextIntlClientProvider
        locale={locale}
        messages={{}}
        timeZone="Europe/Skopje"
        now={new Date('2026-11-12T12:00:00Z')}
      >
        <NotificationItem
          notification={{
            id: 'n',
            userId: 'member',
            type: 'new_message',
            title: 'Title',
            content: 'Content',
            actionUrl: null,
            isRead: true,
            createdAt: '2026-11-12T11:49:00Z',
          }}
          pending={false}
          blocked={false}
          onMarkAsRead={vi.fn()}
          onClose={vi.fn()}
          markReadLabel="Read"
          viewLabel="View"
        />
      </NextIntlClientProvider>
    );
    const expected = new Intl.RelativeTimeFormat(toRelativeTimeLocaleTag(locale), {
      numeric: 'auto',
    }).format(-11, 'minute');
    expect(screen.getByText(expected)).toBeVisible();
    if (locale !== 'en') expect(screen.queryByText('11 minutes ago')).not.toBeInTheDocument();
    if (locale === 'sr') expect(expected).not.toMatch(/[\u0400-\u04FF]/);
  });
});
