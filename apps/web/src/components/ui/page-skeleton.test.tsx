import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';

import de from '@/messages/de/common.json';
import en from '@/messages/en/common.json';
import mk from '@/messages/mk/common.json';
import sq from '@/messages/sq/common.json';
import sr from '@/messages/sr/common.json';
import { LocalizedPageSkeleton } from './localized-page-skeleton';
import { PageSkeleton } from './page-skeleton';
import styles from './page-skeleton.module.css';

vi.unmock('next-intl');

describe.each(['list', 'detail', 'dashboard'] as const)('%s page skeleton', variant => {
  it('delays the visual fallback while keeping polite status immediately outside the busy subtree', () => {
    const { container } = render(
      <PageSkeleton variant={variant} title={en.common.admin} loadingLabel={en.common.loading} />
    );

    const heading = screen.getByRole('heading', { level: 1, name: en.common.admin });
    const busy = heading.closest('[aria-busy="true"]');
    expect(busy).toBeInTheDocument();
    const visual = heading.parentElement;
    expect(visual).toHaveClass(styles.visual);
    expect(busy).toBe(visual);
    expect(heading).toHaveClass('text-2xl');
    const status = screen.getByRole('status');
    expect(status.tagName).toBe('OUTPUT');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toHaveTextContent(en.common.loading);
    expect(status).toHaveClass('sr-only');
    expect(busy).not.toContainElement(status);
    expect(status.closest('[aria-busy="true"]')).toBeNull();
    expect(status.parentElement).toBe(visual?.parentElement);
    expect(visual).not.toContainElement(status);
    expect(heading.closest('[aria-hidden="true"]')).toBeNull();
    expect(status.closest('[aria-hidden="true"]')).toBeNull();

    const shapes = container.querySelectorAll<HTMLElement>('.animate-pulse');
    expect(shapes.length).toBeGreaterThan(0);
    for (const shape of shapes) {
      expect(shape).toHaveAttribute('aria-hidden', 'true');
      expect(shape).toHaveClass('motion-reduce:animate-none');
      expect(visual).toContainElement(shape);
    }
    expect(container.querySelector('[data-testid*="page-ready"]')).toBeNull();
  });
});

describe('LocalizedPageSkeleton', () => {
  it('follows the enclosing client provider when the locale changes', () => {
    const { rerender } = render(
      <NextIntlClientProvider locale="sq" messages={sq}>
        <LocalizedPageSkeleton titleKey="common.admin" variant="list" testId="skeleton" />
      </NextIntlClientProvider>
    );

    expect(screen.getByRole('status')).toHaveTextContent(sq.common.loading);
    rerender(
      <NextIntlClientProvider locale="en" messages={en}>
        <LocalizedPageSkeleton titleKey="common.admin" variant="list" testId="skeleton" />
      </NextIntlClientProvider>
    );

    expect(screen.getByRole('heading', { name: en.common.admin })).toBeInTheDocument();
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(screen.getByRole('status')).toHaveTextContent(en.common.loading);
    expect(screen.getByTestId('skeleton')).toContainElement(screen.getByRole('status'));
  });

  it('matches pages with larger headings when requested', () => {
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <LocalizedPageSkeleton titleKey="common.admin" variant="list" titleSize="3xl" />
      </NextIntlClientProvider>
    );

    expect(screen.getByRole('heading', { name: en.common.admin })).toHaveClass('text-3xl');
  });

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
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent(messages.common.loading);
    expect(status.closest('[aria-busy="true"]')).toBeNull();
  });
});
