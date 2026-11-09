import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';

import de from '@/messages/de/common.json';
import en from '@/messages/en/common.json';
import mk from '@/messages/mk/common.json';
import sq from '@/messages/sq/common.json';
import sr from '@/messages/sr/common.json';
import { LocalizedPageSkeleton, PageSkeleton } from './page-skeleton';

vi.unmock('next-intl');

describe.each(['list', 'detail', 'dashboard'] as const)('%s page skeleton', variant => {
  it('keeps the real heading and polite status outside the hidden shapes', () => {
    const { container } = render(
      <PageSkeleton variant={variant} title={en.common.admin} loadingLabel={en.common.loading} />
    );

    const heading = screen.getByRole('heading', { level: 1, name: en.common.admin });
    const busy = heading.closest('[aria-busy="true"]');
    expect(busy).toBeInTheDocument();
    const status = screen.getByRole('status');
    expect(status.tagName).toBe('OUTPUT');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toHaveTextContent(en.common.loading);
    expect(busy).toContainElement(status);
    expect(heading.closest('[aria-hidden="true"]')).toBeNull();
    expect(status.closest('[aria-hidden="true"]')).toBeNull();

    const shapes = container.querySelectorAll('.animate-pulse');
    expect(shapes.length).toBeGreaterThan(0);
    for (const shape of shapes) {
      expect(shape).toHaveAttribute('aria-hidden', 'true');
      expect(shape).toHaveClass('motion-reduce:animate-none');
    }
    expect(container.querySelector('[data-testid*="page-ready"]')).toBeNull();
  });
});

describe('LocalizedPageSkeleton', () => {
  it.each([
    ['sq', sq],
    ['en', en],
    ['sr', sr],
    ['mk', mk],
    ['de', de],
  ] as const)('uses existing %s title and loading copy', (locale, messages) => {
    render(
      <NextIntlClientProvider locale={locale} messages={messages}>
        <LocalizedPageSkeleton titleKey="common.admin" variant="list" />
      </NextIntlClientProvider>
    );

    expect(screen.getByRole('heading', { name: messages.common.admin })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(messages.common.loading);
  });
});
