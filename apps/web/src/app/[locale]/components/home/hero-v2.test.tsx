import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HeroV2 } from './hero-v2';
import { getStartClaimHrefForSession } from '../../home-v2.core';

describe('HeroV2', () => {
  it('renders Start a claim CTA when UI_V2 is enabled and user is signed out', () => {
    const href = getStartClaimHrefForSession({ locale: 'sq', session: null });

    render(<HeroV2 locale="sq" startClaimHref={href} />);

    const cta = screen.getByTestId('hero-v2-start-claim');
    expect(cta).toBeInTheDocument();
    expect(cta).toHaveTextContent('Start a claim');
    expect(cta).toHaveAttribute('href', '/sq/register');
  });

  it('routes Start a claim CTA to claim creation for signed-in members', () => {
    const href = getStartClaimHrefForSession({
      locale: 'sq',
      session: { userId: 'u-1', role: 'member' },
    });

    render(<HeroV2 locale="sq" startClaimHref={href} />);

    expect(screen.getByTestId('hero-v2-start-claim')).toHaveAttribute(
      'href',
      '/sq/member/claims/new'
    );
  });
});
