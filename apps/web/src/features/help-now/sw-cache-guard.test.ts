import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { HELP_NOW_CACHE_NAME } from './content-packs';

const swPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../public/sw.js');
const swSource = fs.readFileSync(swPath, 'utf8');

describe('MOB-01 service worker cache guard', () => {
  it('allowlists public Help Now assets without caching member or API data', () => {
    expect(swSource).toContain('/help-now-packs/content-packs.v1.json');
    expect(swSource).toContain(HELP_NOW_CACHE_NAME);
    expect(swSource).toContain('sq|en|sr|mk');
    expect(swSource).toContain('url.origin === globalThis.location.origin');
    expect(swSource).toContain('.keys()');
    expect(swSource).toContain("key.startsWith('interdomestik-')");
    expect(swSource).toContain('caches.delete(key)');
    expect(swSource).toContain('async function cacheFreshResponse(request, response)');
    expect(swSource).toContain('HELP_NOW_PUBLIC_ASSETS.has(pathname)');
    expect(swSource).toContain('HELP_NOW_PUBLIC_ROUTE.test(pathname)');
    expect(swSource).toMatch(/networkFirst[\s\S]*cacheFreshResponse\(request, response\)/);
    expect(swSource).toMatch(
      /HELP_NOW_PUBLIC_ROUTE[\s\S]*event\.respondWith\(networkFirst\(event\.request\)\)/
    );
    expect(swSource).toContain('await (await caches.open(HELP_NOW_CACHE_NAME)).put');
    expect(swSource).toContain('response.clone()');
    expect(swSource).not.toContain('/_next/static/');
    expect(swSource).not.toContain('/api/');
    expect(swSource).not.toContain('/member/');
    expect(swSource).not.toContain('localStorage');
    expect(swSource).not.toContain('indexedDB');
  });
});
