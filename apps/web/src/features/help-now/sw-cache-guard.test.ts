import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { HELP_NOW_CACHE_NAME } from './content-packs';

const swSource = fs.readFileSync(path.resolve(process.cwd(), 'public/sw.js'), 'utf8');

describe('MOB-01 service worker cache guard', () => {
  it('allowlists public Help Now assets without caching member or API data', () => {
    expect(swSource).toContain('/help-now-packs/content-packs.v1.json');
    expect(swSource).toContain(HELP_NOW_CACHE_NAME);
    expect(swSource).toContain('sq|en|sr|mk|hr|de');
    expect(swSource).toContain('url.origin === globalThis.location.origin');
    expect(swSource).toContain('.keys()');
    expect(swSource).toContain("key.startsWith('interdomestik-')");
    expect(swSource).toContain('caches.delete(key)');
    expect(swSource).toMatch(
      /async function cacheHelpNowNavigation\(request\) \{[\s\S]*?return await fetch\(request\);[\s\S]*?helpNowFallbackResponse\(request\);[\s\S]*?\}/
    );
    expect(swSource.match(/cacheHelpNowNavigation[\s\S]*?cache\.put/)).toBeNull();
    expect(swSource).not.toContain('/_next/static/');
    expect(swSource).not.toContain('/api/');
    expect(swSource).not.toContain('/member/');
    expect(swSource).not.toContain('localStorage');
    expect(swSource).not.toContain('indexedDB');
  });
});
