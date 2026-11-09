import { describe, expect, it } from 'vitest';
import en from '@/messages/en/sponsors.json';
import sq from '@/messages/sq/sponsors.json';
import mk from '@/messages/mk/sponsors.json';
import sr from '@/messages/sr/sponsors.json';
import de from '@/messages/de/sponsors.json';
import srNav from '@/messages/sr/nav.json';
import srOptOut from '@/messages/sr/sponsorOptOut.json';
import srTasks from '@/messages/sr/sponsorTasks.json';

function keys(value: object, prefix = ''): string[] {
  return Object.entries(value)
    .flatMap(([key, child]) =>
      typeof child === 'object' && child !== null
        ? keys(child, `${prefix}${key}.`)
        : [`${prefix}${key}`]
    )
    .sort();
}
describe('sponsor catalogs before registry integration', () => {
  it.each([sq, mk, sr, de])('has matching keys and interpolation parameters', catalog => {
    expect(keys(catalog)).toEqual(keys(en));
    const params = (value: object): string[] =>
      JSON.stringify(value)
        .match(/\{\w+\}/gu)
        ?.sort() ?? [];
    expect(params(catalog)).toEqual(params(en));
  });

  it('keeps Serbian sponsor copy in the Latin script used by the sr catalogs', () => {
    const cyrillic = /[\u0400-\u04FF]/u;
    for (const catalog of [sr, srTasks, srOptOut])
      expect(JSON.stringify(catalog)).not.toMatch(cyrillic);
    expect(srNav.nav.sponsors).not.toMatch(cyrillic);
  });
});
