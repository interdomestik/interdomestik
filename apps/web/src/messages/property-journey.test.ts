import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const locales = ['sq', 'en', 'sr', 'mk'] as const;

function readMessages(locale: (typeof locales)[number]): Record<string, unknown> {
  const file = path.resolve(__dirname, locale, 'propertyJourney.json');
  expect(fs.existsSync(file), `missing ${locale}/propertyJourney.json`).toBe(true);
  return JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>;
}

function leafPaths(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null) return [prefix];
  return Object.entries(value).flatMap(([key, child]) =>
    leafPaths(child, prefix ? `${prefix}.${key}` : key)
  );
}

describe('propertyJourney messages', () => {
  it('keeps complete parity across SQ, EN, SR, and MK', () => {
    const messages = locales.map(readMessages);
    const expected = leafPaths(messages[0]).sort();
    for (const localeMessages of messages) {
      expect(leafPaths(localeMessages).sort()).toEqual(expected);
    }
  });

  it('keeps the core safety and commercial copy exact', () => {
    const sq = JSON.stringify(readMessages('sq'));
    expect(sq).toContain('A ka ende rrezik aktiv');
    expect(sq).toContain('Nëse ndodheni në BE, mund të telefononi falas në 112.');
    expect(sq).toContain('Organizo të dhënat e dëmit tim');
  });

  it('does not introduce coverage, fault, or outcome promises', () => {
    for (const locale of locales) {
      const copy = JSON.stringify(readMessages(locale));
      expect(copy).not.toMatch(/24\/7|guarantee|guaranteed compensation|garantovanu naknadu/i);
    }
  });
});
