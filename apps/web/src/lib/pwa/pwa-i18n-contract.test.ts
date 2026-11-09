import fs from 'node:fs';
import vm from 'node:vm';
import { workerHarness } from '@/features/help-now/sw-test-harness';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (file: string): string => fs.readFileSync(path.join(root, file), 'utf8');
const locales = ['en', 'sq', 'mk', 'sr', 'de'];

describe('pwa-i18n-contract', () => {
  it('owns common catalog additions with complete localized install guidance', () => {
    const policy = read('../../scripts/modularity-guard-policy.mjs');
    expect(policy).toContain("['common.json', 'pwa-i18n-contract']");
    for (const locale of locales) {
      const copy = JSON.parse(read(`src/messages/${locale}/common.json`)).common.pwa;
      expect(new Set(Object.keys(copy))).toEqual(
        new Set(['install', 'iosInstructions', 'iosTitle', 'offlineBody', 'offlineTitle', 'retry'])
      );
      const workerCopy = vm.runInContext('OFFLINE_COPY', workerHarness().context);
      expect(workerCopy[locale]).toEqual([copy.offlineTitle, copy.offlineBody, copy.retry]);
      expect(
        Object.values(copy).every(value => typeof value === 'string' && value.length > 0)
      ).toBe(true);
    }
  });
  it('reuses only the existing public scene checklist in the offline document', () => {
    const html = read('public/offline.html');
    const document = new DOMParser().parseFromString(html, 'text/html');
    for (const locale of locales) {
      const copy = JSON.parse(read(`src/features/help-now/copy-${locale}.json`));
      const section = document.querySelector(`[lang="${locale}"]#${locale}`)!;
      expect(section.querySelector('h2')?.textContent).toBe(copy.emergency);
      expect([...section.querySelectorAll('li')].map(item => item.textContent)).toEqual(
        copy.checklist
      );
      expect(section.textContent?.replace(/\s+/g, ' ')).toContain(copy.packBody);
    }
    expect(document.querySelector('script, form, input, button')).toBeNull();
  });
});
