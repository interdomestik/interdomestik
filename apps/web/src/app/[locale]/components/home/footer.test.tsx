import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  messages: {
    common: {
      appName: 'Interdomestik',
      tagline: 'Claim-first support',
    },
    footer: {
      description: 'Consumer help for claims and next-step routing.',
      noWinNoFee: 'No Win, No Fee',
      legal: 'Legal',
      privacy: 'Privacy',
      terms: 'Terms',
      cookies: 'Cookies',
      support: 'Support',
      help: 'Help Center',
      faq: 'FAQ',
      hours: 'Hours: {hours}',
      copyright: 'Copyright {year} {appName}',
      disclaimer: 'Claims assistance service.',
      hotlineLabel: '24/7 Hotline',
      chatWithUs: 'Chat with us',
      emailUs: 'Email Us',
      membership: 'Membership',
      plansPricing: 'Plans & Pricing',
      joinClub: 'Join the Club',
      memberLogin: 'Member Login',
      about: 'About',
      safetyNet: {
        eyebrow: 'Urgent claim support',
        title: 'Call or WhatsApp for the next safe step',
        body: 'Use the hotline for rapid routing, support, and next-step guidance.',
        call: 'Call hotline',
        whatsapp: 'Open WhatsApp',
        chips: [
          'Shqip / English support',
          'Claim-first launch scope',
          'Routing in under 60 seconds',
        ],
      },
    },
  },
}));

vi.mock('next-intl', () => ({
  useTranslations: (namespace?: string) => {
    const resolve = (key?: string) => {
      const path = [namespace, key].filter(Boolean).join('.').split('.');
      return path.reduce<unknown>((value, segment) => {
        if (value && typeof value === 'object' && segment in value) {
          return (value as Record<string, unknown>)[segment];
        }
        return undefined;
      }, hoisted.messages);
    };

    const translate = (key: string, values?: Record<string, string | number>) => {
      const value = resolve(key);
      if (typeof value !== 'string') {
        return key;
      }

      return Object.entries(values ?? {}).reduce(
        (message, [name, replacement]) => message.replace(`{${name}}`, String(replacement)),
        value
      );
    };

    translate.raw = (key: string) => resolve(key);

    return translate;
  },
}));

vi.mock('@/i18n/routing', () => ({
  Link: ({ children, href, ...props }: { children: ReactNode; href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('@/lib/contact', () => ({
  contactInfo: {
    phone: '+383 49 900 600',
    whatsapp: 'https://wa.me/38349900600',
    address: 'Prishtina, Kosovo',
    hours: 'Mon-Fri, 09:00-17:00',
  },
}));

import { Footer } from './footer';

describe('Footer', () => {
  it('renders the claim-first safety net with urgent contact CTAs and multilingual cues', () => {
    render(<Footer />);

    expect(screen.getByTestId('footer-safety-net')).toBeInTheDocument();
    expect(screen.getByText('Call or WhatsApp for the next safe step')).toBeInTheDocument();
    expect(screen.getByTestId('footer-safety-net-call')).toHaveAttribute(
      'href',
      'tel:+38349900600'
    );
    expect(screen.getByTestId('footer-safety-net-whatsapp')).toHaveAttribute(
      'href',
      'https://wa.me/38349900600'
    );
    expect(screen.getAllByTestId('footer-safety-net-chip')).toHaveLength(3);
    expect(screen.getByText('Shqip / English support')).toBeInTheDocument();
  });
});
