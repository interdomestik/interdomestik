import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const manifest = JSON.parse(fs.readFileSync(path.join(web, 'public/manifest.json'), 'utf8'));

describe('same-origin tenant manifest contract', () => {
  it.each(['https://ks.interdomestik.com', 'https://mk.interdomestik.com'])(
    'keeps identity, scope, launch and icons on %s',
    origin => {
      const manifestUrl = `${origin}/manifest.json`;
      for (const value of [manifest.id, manifest.scope, manifest.start_url]) {
        expect(value).toBe('/');
        expect(new URL(value, manifestUrl).origin).toBe(origin);
      }
      for (const icon of manifest.icons) {
        expect(new URL(icon.src, manifestUrl).origin).toBe(origin);
      }
    }
  );
  it.each(manifest.icons as { src: string; type: string; sizes: string }[])(
    'has usable bytes matching the declared icon $src',
    icon => {
      const data = fs.readFileSync(path.join(web, 'public', icon.src));
      expect(data.length).toBeGreaterThan(0);
      if (icon.type === 'image/png') {
        expect([...data.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
        expect(`${data.readUInt32BE(16)}x${data.readUInt32BE(20)}`).toBe(icon.sizes);
      }
    }
  );
  it('declares the explicit manifest metadata for supported and fallback locales', () => {
    const entry = fs.readFileSync(path.join(web, 'src/app/[locale]/_core.entry.tsx'), 'utf8');
    expect(entry.match(/manifest: '\/manifest.json'/g)).toHaveLength(2);
  });
});
