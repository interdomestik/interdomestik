import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const locales = ['sq', 'en', 'sr', 'mk'] as const;

function readMessages(locale: (typeof locales)[number]): Record<string, unknown> {
  const file = path.resolve(__dirname, locale, 'flightJourney.json');
  expect(fs.existsSync(file), `missing ${locale}/flightJourney.json`).toBe(true);
  return JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>;
}

function leafPaths(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null) return [prefix];
  return Object.entries(value).flatMap(([key, child]) =>
    leafPaths(child, prefix ? `${prefix}.${key}` : key)
  );
}

describe('flightJourney messages', () => {
  it('keeps complete parity across SQ, EN, SR, and MK', () => {
    const messages = locales.map(readMessages);
    const expected = leafPaths(messages[0]).sort();
    for (const localeMessages of messages) {
      expect(leafPaths(localeMessages).sort()).toEqual(expected);
    }
  });

  it('keeps the core Albanian action and service boundary exact', () => {
    const sq = JSON.stringify(readMessages('sq'));
    expect(sq).toContain('A jeni ende në aeroport');
    expect(sq).toContain('Shikoni të drejtat zyrtare të pasagjerëve');
    expect(sq).toContain('nuk është aktiv në ofertën aktuale');
  });

  it('does not introduce amounts, eligibility, or outcome promises', () => {
    for (const locale of locales) {
      const copy = JSON.stringify(readMessages(locale));
      expect(copy).not.toMatch(/€\s?\d|you qualify|kualifikoheni|guaranteed|garantovano/i);
    }
  });
});
