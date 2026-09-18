import { describe, expect, it } from 'vitest';

import {
  MAX_TRANSIT_COUNTRIES,
  parseDiasporaCorridorContext,
  serializeDiasporaCorridorContext,
  type DiasporaCorridorContext,
} from './corridor';

const validContext: DiasporaCorridorContext = {
  origin: 'DE',
  destination: 'IT',
  transit: ['AT', 'CH'],
};

describe('diaspora corridor preparation', () => {
  it('parses explicit scalar endpoints and an ordered transit list', () => {
    expect(
      parseDiasporaCorridorContext({
        origin: 'DE',
        destination: 'IT',
        transit: ['AT', 'CH'],
      })
    ).toEqual(validContext);
  });

  it('accepts absent and scalar transit input', () => {
    expect(parseDiasporaCorridorContext({ origin: 'DE', destination: 'IT' })).toEqual({
      origin: 'DE',
      destination: 'IT',
      transit: [],
    });
    expect(
      parseDiasporaCorridorContext({ origin: 'DE', destination: 'IT', transit: 'AT' })
    ).toEqual({ origin: 'DE', destination: 'IT', transit: ['AT'] });
  });

  it('preserves duplicate transit values, their order, and equal endpoints', () => {
    expect(
      parseDiasporaCorridorContext({
        origin: 'DE',
        destination: 'DE',
        transit: ['AT', 'CH', 'AT'],
      })
    ).toEqual({ origin: 'DE', destination: 'DE', transit: ['AT', 'CH', 'AT'] });
  });

  it.each([
    ['missing origin', { destination: 'IT' }],
    ['missing destination', { origin: 'DE' }],
    ['empty origin', { origin: '', destination: 'IT' }],
    ['whitespace destination', { origin: 'DE', destination: ' IT ' }],
    ['lowercase origin', { origin: 'de', destination: 'IT' }],
    ['unsupported destination', { origin: 'DE', destination: 'US' }],
    ['repeated origin', { origin: ['DE', 'IT'], destination: 'IT' }],
    ['repeated destination', { origin: 'DE', destination: ['IT', 'AT'] }],
    ['empty transit member', { origin: 'DE', destination: 'IT', transit: ['AT', ''] }],
    ['unsupported transit member', { origin: 'DE', destination: 'IT', transit: ['AT', 'US'] }],
    [
      'overlong transit list',
      {
        origin: 'DE',
        destination: 'IT',
        transit: Array.from({ length: MAX_TRANSIT_COUNTRIES + 1 }, () => 'AT'),
      },
    ],
  ] as const)('fails closed for %s', (_case, input) => {
    expect(parseDiasporaCorridorContext(input)).toBeNull();
  });

  it('ignores unrelated inference inputs instead of using them as corridor values', () => {
    expect(
      parseDiasporaCorridorContext({
        country: 'DE',
        forwardedFor: '203.0.113.10',
        locale: 'mk',
        host: 'mk.example.test',
        referral: 'AT',
        deviceCountry: 'CH',
      })
    ).toBeNull();
  });

  it('serializes a validated context without changing duplicate order', () => {
    const params = serializeDiasporaCorridorContext(
      validContext,
      new URLSearchParams('country=CH')
    );

    expect(params.toString()).toBe('country=CH&origin=DE&destination=IT&transit=AT&transit=CH');
    expect(
      parseDiasporaCorridorContext({
        origin: params.get('origin') ?? undefined,
        destination: params.get('destination') ?? undefined,
        transit: params.getAll('transit'),
      })
    ).toEqual(validContext);
  });

  it('replaces stale corridor keys while preserving unrelated explicit query state', () => {
    const params = new URLSearchParams(
      'country=CH&origin=AT&destination=DE&transit=NL&source=member'
    );

    expect(serializeDiasporaCorridorContext(validContext, params).toString()).toBe(
      'country=CH&source=member&origin=DE&destination=IT&transit=AT&transit=CH'
    );
  });

  it('rejects invalid runtime values at the serialization boundary', () => {
    expect(() =>
      serializeDiasporaCorridorContext({
        origin: 'DE',
        destination: 'US',
        transit: [],
      } as never)
    ).toThrow();
  });
});
