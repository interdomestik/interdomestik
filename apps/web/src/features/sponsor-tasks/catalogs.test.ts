import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

function leaves(value: unknown, prefix = ''): Record<string, string> {
  if (typeof value === 'string') return { [prefix]: value };
  if (!value || typeof value !== 'object') throw new Error('Catalog values must be strings');
  return Object.assign(
    {},
    ...Object.entries(value).map(([key, child]) => leaves(child, `${prefix}.${key}`))
  ) as Record<string, string>;
}

describe.each(['sponsorOptOut', 'sponsorTasks'])('%s catalogs', namespace => {
  it('loads through the real next-intl namespace contract', async () => {
    const { createTranslator } = await vi.importActual<typeof import('next-intl')>('next-intl');
    const messages = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, '../../messages/en', `${namespace}.json`), 'utf8')
    );
    expect(Object.keys(messages)).toEqual([namespace]);
    const translate = createTranslator({ locale: 'en', messages, namespace });
    expect(translate('title')).toBe(
      namespace === 'sponsorOptOut' ? 'Leave your company membership program' : 'Sponsor tasks'
    );
  });
  it('keeps EN/SQ/MK/SR/DE keys, placeholders and nonempty copy aligned', () => {
    const catalogs = ['en', 'sq', 'mk', 'sr', 'de'].map(locale =>
      leaves(
        JSON.parse(
          fs.readFileSync(
            path.resolve(__dirname, '../../messages', locale, `${namespace}.json`),
            'utf8'
          )
        )
      )
    );
    const baseline = catalogs[0] ?? {};
    catalogs.forEach(catalog => {
      expect(Object.keys(catalog).sort()).toEqual(Object.keys(baseline).sort());
      Object.entries(catalog).forEach(([key, value]) => {
        expect(value.trim().length).toBeGreaterThan(0);
        expect(value.match(/\{\w+\}/gu) ?? []).toEqual(baseline[key]?.match(/\{\w+\}/gu) ?? []);
      });
    });
  });
});
