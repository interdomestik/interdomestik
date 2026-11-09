import fs from 'node:fs';
import vm from 'node:vm';
import {
  downloadedOfflineDocument,
  publicResponse,
  STATIC_CACHE,
  workerHarness,
} from '@/features/help-now/sw-test-harness';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (file: string): string => fs.readFileSync(path.join(root, file), 'utf8');
const locales = ['en', 'sq', 'mk', 'sr', 'de'];

function assertOfflineLocale(locale: string, html: string): void {
  const pwa = JSON.parse(read(`src/messages/${locale}/common.json`)).common.pwa;
  const copy = JSON.parse(read(`src/features/help-now/copy-${locale}.json`));
  const document = new DOMParser().parseFromString(html, 'text/html');
  const text = (selector: string): string | undefined =>
    document.querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim();
  expect(document.documentElement.lang).toBe(locale);
  expect(text('h1')).toBe(pwa.offlineHeading);
  expect(text('#offline-privacy')).toBe(pwa.offlinePrivacy);
  expect(text('#offline-availability')).toBe(pwa.offlineAvailability);
  expect(text('h2')).toBe(copy.emergency);
  expect([...document.querySelectorAll('li')].map(item => item.textContent)).toEqual(
    copy.checklist
  );
  expect(document.querySelectorAll('section')).toHaveLength(1);
  expect(document.querySelector('section')?.lang).toBe(locale);
  expect(document.querySelector('script, form, input, button')).toBeNull();
}

describe('pwa-i18n-contract', () => {
  it('owns common catalog additions with complete locale parity', () => {
    expect(read('../../scripts/modularity-guard-policy.mjs')).toContain(
      "['common.json', 'pwa-i18n-contract']"
    );
    const workerCopy = vm.runInContext('OFFLINE_COPY', workerHarness().context);
    for (const locale of locales) {
      const copy = JSON.parse(read(`src/messages/${locale}/common.json`)).common.pwa;
      expect(new Set(Object.keys(copy))).toEqual(
        new Set([
          'install',
          'iosInstructions',
          'iosTitle',
          'offlineBody',
          'offlineTitle',
          'retry',
          'offlineHeading',
          'offlinePrivacy',
          'offlineAvailability',
        ])
      );
      const scene = JSON.parse(read(`src/features/help-now/copy-${locale}.json`));
      expect(workerCopy[locale]).toEqual([
        copy.offlineTitle,
        copy.offlineBody,
        copy.retry,
        copy.offlineHeading,
        copy.offlinePrivacy,
        copy.offlineAvailability,
        scene.emergency,
        scene.continueSafe,
        scene.packBody,
        scene.checklist,
      ]);
      expect(
        Object.values(copy).every(value => typeof value === 'string' && value.length > 0)
      ).toBe(true);
    }
  });
  it('keeps one script-free offline template and removes generated HTML copies', () => {
    const template = read('public/offline.html');
    for (const key of ['locale', 'heading', 'privacy', 'availability', 'checklist']) {
      expect(template).toContain('{{' + key + '}}');
    }
    expect(
      new DOMParser().parseFromString(template, 'text/html').querySelector('script')
    ).toBeNull();
    for (const locale of locales.filter(locale => locale !== 'en')) {
      expect(fs.existsSync(path.join(root, `public/offline-${locale}.html`))).toBe(false);
    }
    expect(fs.existsSync(path.resolve(root, '../../scripts/generate-pwa-offline.mjs'))).toBe(false);
  });
  it.each(locales)('serves a downloaded offline Help Now document in %s', async locale => {
    const { response } = await downloadedOfflineDocument(locale);
    expect(response?.status).toBe(200);
    const html = await response.text();
    expect(html).not.toContain('{{');
    assertOfflineLocale(locale, html);
  });
  it('escapes inserted locale strings instead of creating markup', async () => {
    const { worker } = await downloadedOfflineDocument('sq');
    const copy = vm.runInContext('OFFLINE_COPY', worker.context);
    const payload = '<img src=x onerror="alert(1)"> & \'';
    copy.sq[3] = payload;
    copy.sq[9] = [payload];
    const response = await worker.dispatch('fetch', { request: worker.navigate('/sq/help-now') });
    const html = await response!.text();
    const document = new DOMParser().parseFromString(html, 'text/html');
    expect(document.querySelector('h1')?.textContent).toBe(payload);
    expect(document.querySelector('li')?.textContent).toBe(payload);
    expect(document.title).toBe(payload + ' | Interdomestik');
    expect(document.querySelector('script, img')).toBeNull();
    expect(html).toContain('&lt;img');
  });
  it('rejects an older cached English document instead of serving it for an SQ request', async () => {
    const { worker } = await downloadedOfflineDocument('sq');
    const cache = await worker.caches.open(STATIC_CACHE);
    await cache.put(
      worker.request('/offline.html'),
      publicResponse(
        '/offline.html',
        { 'content-type': 'text/html' },
        '<html lang="en">Old offline document</html>'
      )
    );
    const response = await worker.dispatch('fetch', { request: worker.navigate('/sq/help-now') });
    expect(response?.status).toBe(503);
    const document = new DOMParser().parseFromString(await response!.text(), 'text/html');
    expect(document.documentElement.lang).toBe('sq');
    expect(document.body.textContent).not.toContain('Old offline document');
  });
});
