import { afterEach, describe, expect, it } from 'vitest';
import {
  formatPilotDate,
  formatPilotDateTime,
  formatPilotLongDate,
  formatPilotTime,
  pilotDateKey,
  resolveDateLocale,
} from './date';

const originalZone = process.env.TZ;
afterEach(() => {
  process.env.TZ = originalZone;
});

describe('shared presentation dates', () => {
  it.each(['sq', 'de', 'sr', 'mk'])('pads %s dates and uses a 24-hour clock', locale => {
    expect(formatPilotDate('2026-01-02T08:04:00Z', locale, '—')).toBe('02.01.2026');
    expect(formatPilotDateTime('2026-01-02T08:04:59Z', locale, '—')).toBe('02.01.2026 09:04');
  });
  it('preserves English date order with a 24-hour clock', () => {
    expect(formatPilotDateTime('2026-11-12T18:05:00Z', 'en', '—')).toBe('11/12/2026 19:05');
  });
  it.each([null, undefined, '', 'invalid'])('returns the supplied fallback for %s', value => {
    expect(formatPilotDate(value, 'sq', '—')).toBe('—');
    expect(formatPilotDateTime(value, 'sq', '—')).toBe('—');
  });
  it('handles the pilot daylight-saving boundary and midnight deterministically', () => {
    expect(formatPilotDateTime('2026-03-29T00:30:00Z', 'mk', '')).toBe('29.03.2026 01:30');
    expect(formatPilotDateTime('2026-03-29T01:30:00Z', 'mk', '')).toBe('29.03.2026 03:30');
    expect(formatPilotDateTime('2026-11-11T23:00:00Z', 'sq', '')).toBe('12.11.2026 00:00');
  });
  it('ignores host time zone, including for timestamps without offsets', () => {
    for (const zone of ['UTC', 'America/Los_Angeles', 'Asia/Tokyo']) {
      process.env.TZ = zone;
      expect(formatPilotDateTime('2026-11-11T23:30:00', 'sq', '')).toBe('12.11.2026 00:30');
    }
  });
});

describe('pilot time, day key and long date', () => {
  it('formats a 24-hour time and the pilot calendar day', () => {
    expect(formatPilotTime('2026-11-12T22:53:00Z', '')).toBe('23:53');
    expect(pilotDateKey('2026-11-12T23:30:00Z')).toBe('2026-11-13');
    expect(pilotDateKey('invalid')).toBe('');
    expect(formatPilotTime(null, '—')).toBe('—');
  });

  it('renders the Serbian long date in Latin script', () => {
    expect(resolveDateLocale('sr')).toBe('sr-Latn-RS');
    const text = formatPilotLongDate(new Date('2026-11-13T09:00:00Z'), 'sr');
    expect(text).toContain('novembar');
    expect(text).not.toMatch(/[\u0400-\u04FF]/);
    expect(formatPilotLongDate(new Date('2026-11-13T09:00:00Z'), 'sq')).toContain('nëntor');
  });
});
