import type { ReactNode } from 'react';
import sqHeroMessages from '@/messages/sq/hero.json';
import { createUseTranslationsMock } from '@/test/next-intl-mock';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PublicEntryActions } from './public-entry-actions';

vi.mock('next-intl', () => ({
  useTranslations: createUseTranslationsMock(() => ({ hero: sqHeroMessages.hero })),
}));

vi.mock('@/i18n/routing', () => ({
  Link: ({
    children,
    href,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { children: ReactNode; href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

describe('PublicEntryActions', () => {
  it('keeps membership first and exposes exactly three truthful destinations', () => {
    render(<PublicEntryActions />);

    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(3);
    expect(links.map(link => link.getAttribute('href'))).toEqual([
      '/pricing',
      '/help-now',
      '#free-start-intake',
    ]);
    expect(links[0]).toHaveAccessibleName(/Shih anëtarësimin vjetor/i);
  });

  it('makes each secondary title, description, and arrow one generous link target', () => {
    render(<PublicEntryActions />);

    const help = screen.getByTestId('public-entry-help-now');
    expect(within(help).getByText(/Ndihmë Tani/i)).toBeInTheDocument();
    expect(within(help).getByText(/listë të qartë/i)).toBeInTheDocument();
    expect(help).toHaveClass('min-h-32');
    expect(help.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');

    const organize = screen.getByTestId('public-entry-case-organize');
    expect(within(organize).getByText(/Organizo të dhënat e rastit/i)).toBeInTheDocument();
    expect(within(organize).getByText(/Mblidh dhe sistemo/i)).toBeInTheDocument();
    expect(organize).toHaveClass('min-h-32');
  });

  it('does not introduce unsupported quantitative or guarantee claims', () => {
    render(<PublicEntryActions />);

    expect(document.body).not.toHaveTextContent(/4\.9|8[.,]500|100\s?%|24\/7|garant/i);
  });
});
