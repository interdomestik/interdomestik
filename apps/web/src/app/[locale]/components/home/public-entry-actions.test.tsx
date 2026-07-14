import type { ReactNode } from 'react';
import sqHeroMessages from '@/messages/sq/hero.json';
import { createUseTranslationsMock } from '@/test/next-intl-mock';
import { fireEvent, render, screen, within } from '@testing-library/react';
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
  it('makes three immediate-help situations primary and keeps flight honest', () => {
    render(<PublicEntryActions whatsappHref="https://wa.me/38349900600" />);

    const situations = screen.getByTestId('public-entry-situations');
    const links = within(situations).getAllByRole('link');
    expect(links).toHaveLength(3);
    expect(links.map(link => link.getAttribute('href'))).toEqual([
      '#free-start-intake',
      '#free-start-intake',
      '#free-start-intake',
    ]);
    expect(links.map(link => link.textContent)).toEqual([
      expect.stringMatching(/aksident me veturë/i),
      expect.stringMatching(/Jam lënduar/i),
      expect.stringMatching(/dëm në pronë/i),
    ]);

    const flight = screen.getByTestId('public-entry-flight');
    expect(flight).toHaveTextContent(/Fluturimi im u vonua ose u anulua/i);
    expect(flight).toHaveTextContent(/Së shpejti/i);
    expect(within(flight).queryByRole('link')).not.toBeInTheDocument();
    expect(within(flight).queryByRole('button')).not.toBeInTheDocument();
    expect(flight).not.toHaveAttribute('aria-disabled');
  });

  it('offers two clearly named asynchronous WhatsApp paths and safety copy', () => {
    render(<PublicEntryActions whatsappHref="https://wa.me/38349900600" />);

    expect(screen.getByRole('link', { name: /mesazh në WhatsApp/i })).toHaveAttribute(
      'href',
      'https://wa.me/38349900600'
    );
    expect(screen.getByRole('link', { name: /Jetoni jashtë vendit/i })).toHaveAttribute(
      'href',
      'https://wa.me/38349900600'
    );
    expect(screen.getByText(/Përgjigjemi gjatë orarit të punës/i)).toBeInTheDocument();
    expect(screen.getByText(/shërbimet lokale të emergjencës/i)).toBeInTheDocument();
    expect(screen.getByText(/Pa llogari\. Pa pagesë\./i)).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(/24\/7|garant/i);
  });

  it('places annual membership after the immediate-help journey', () => {
    render(<PublicEntryActions whatsappHref="https://wa.me/38349900600" />);

    const situations = screen.getByTestId('public-entry-situations');
    const membership = screen.getByTestId('public-entry-membership');
    expect(membership).toHaveAttribute('href', '/pricing');
    expect(membership).toHaveAccessibleName(/Shihni anëtarësimin vjetor/i);
    expect(
      situations.compareDocumentPosition(membership) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it('hands off only the vehicle action as a one-shot local intent', () => {
    const received: unknown[] = [];
    const listener = (event: Event) => received.push((event as CustomEvent).detail);
    window.addEventListener('interdomestik:public-intent', listener);

    render(<PublicEntryActions />);
    fireEvent.click(screen.getByTestId('public-entry-vehicle'));
    fireEvent.click(screen.getByTestId('public-entry-injury'));
    fireEvent.click(screen.getByTestId('public-entry-property'));

    expect(received).toEqual([{ intent: 'vehicle' }]);
    window.removeEventListener('interdomestik:public-intent', listener);
  });
});
