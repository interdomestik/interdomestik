import type { ReactNode } from 'react';
import sqHeroMessages from '@/messages/sq/hero.json';
import { createUseTranslationsMock } from '@/test/next-intl-mock';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PublicEntryActions } from './public-entry-actions';
import { takePendingPublicEntryIntent } from './public-entry-intent';

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
  it('makes all four immediate-help situations real and keeps flight orientation honest', () => {
    render(<PublicEntryActions whatsappHref="https://wa.me/38349900600" />);

    const situations = screen.getByTestId('public-entry-situations');
    const links = within(situations).getAllByRole('link');
    expect(links).toHaveLength(4);
    expect(links.map(link => link.getAttribute('href'))).toEqual([
      '#free-start-intake',
      '#free-start-intake',
      '#free-start-intake',
      '#flight-guidance',
    ]);
    expect(links.map(link => link.textContent)).toEqual([
      expect.stringMatching(/aksident me veturë/i),
      expect.stringMatching(/Jam lënduar/i),
      expect.stringMatching(/dëm në pronë/i),
      expect.stringMatching(/Fluturimi im u vonua ose u anulua/i),
    ]);

    const flight = screen.getByTestId('public-entry-flight');
    expect(flight).toHaveTextContent(/Fluturimi im u vonua ose u anulua/i);
    expect(flight).not.toHaveTextContent(/Së shpejti/i);
    expect(flight).toHaveAttribute('href', '#flight-guidance');
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

  it('keeps only the immediate-help and support groups without the retired membership row', () => {
    render(<PublicEntryActions whatsappHref="https://wa.me/38349900600" />);

    expect(screen.getByTestId('public-entry-situations')).toBeInTheDocument();
    expect(screen.getAllByText(/WhatsApp/i)).toHaveLength(2);
    expect(screen.queryByTestId('public-entry-membership')).not.toBeInTheDocument();
    expect(document.querySelector('a[href*="/pricing"]')).toBeNull();
  });

  it('hands off all four situations as one-shot local intents', () => {
    const received: unknown[] = [];
    const listener = (event: Event) => received.push((event as CustomEvent).detail);
    window.addEventListener('interdomestik:public-intent', listener);

    render(<PublicEntryActions />);
    fireEvent.click(screen.getByTestId('public-entry-vehicle'));
    fireEvent.click(screen.getByTestId('public-entry-injury'));
    fireEvent.click(screen.getByTestId('public-entry-property'));
    fireEvent.click(screen.getByTestId('public-entry-flight'));

    expect(received).toEqual([
      { intent: 'vehicle' },
      { intent: 'injury' },
      { intent: 'property' },
      { intent: 'flight' },
    ]);
    takePendingPublicEntryIntent();
    window.removeEventListener('interdomestik:public-intent', listener);
  });
});
