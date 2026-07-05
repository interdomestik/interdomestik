import { describe, expect, it } from 'vitest';
import { getHeroPrimaryLabel } from './hero-cta-label';

const labels = {
  'v2.helpNow': 'Get help now (60 sec)',
  callNow: 'Start in 60 seconds',
  cta: 'Start protection',
};

describe('getHeroPrimaryLabel', () => {
  const t = (key: string) => labels[key as keyof typeof labels];

  it('matches the public Help Now destination with urgent copy', () => {
    expect(getHeroPrimaryLabel('/help-now', t)).toBe('Get help now (60 sec)');
  });

  it('keeps existing membership and anchor labels', () => {
    expect(getHeroPrimaryLabel('#free-start-intake', t)).toBe('Start in 60 seconds');
    expect(getHeroPrimaryLabel('/member', t)).toBe('Start protection');
  });
});
