// Genuine Playwright fixture, no application/owner factory or witness registration.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { test as base, expect } from '@playwright/test';
import { readOwned } from '../image-custody.mjs';
const root = '/Volumes/Dev2TB/interdomestik/proofs/m4-compiled-browser-firefox-v1';
const sha = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const manifest = JSON.parse(readOwned(process.env.M4_COMPILED_BROWSER_PROFILES_FILE, 32768, true));
const executable = process.env.M4_COMPILED_BROWSER_EXECUTABLE;
const origin = new URL(process.env.M4_COMPILED_FIXTURE_ORIGIN).origin;
for (const directory of [manifest.profileRoot, manifest.home, manifest.tmp]) {
  const stat = fs.lstatSync(directory);
  if (
    !path.isAbsolute(directory) ||
    fs.realpathSync(directory) !== directory ||
    !stat.isDirectory() ||
    stat.uid !== process.getuid() ||
    (stat.mode & 0o7777) !== 0o700
  )
    throw Error('Private per-invocation Firefox data required');
}
if (
  new Set([manifest.profileRoot, manifest.home, manifest.tmp]).size !== 3 ||
  manifest.profiles.some(row => path.dirname(row.path) !== manifest.profileRoot)
)
  throw Error('Exact per-invocation Firefox profile children required');
if (
  manifest.version !== 1 ||
  manifest.firefoxRevision !== '1543' ||
  !Array.isArray(manifest.profiles) ||
  manifest.profiles.length < 4 ||
  manifest.profiles.length > 16 ||
  new Set(manifest.profiles.map(row => row.path)).size !== manifest.profiles.length ||
  executable !== manifest.executable.path ||
  !executable.startsWith(root + '/store/firefox-1543/') ||
  fs.realpathSync(executable) !== executable ||
  sha(executable) !== manifest.executable.sha256
)
  throw Error('Pinned Firefox/profile manifest refused');
export const test = base.extend({
  browser: [
    async ({ playwright }, use) => {
      const active = new Set(),
        pending = new Set();
      let index = 0,
        closing = false;
      const facade = {
        newContext(options) {
          if (
            closing ||
            Object.keys(options).sort().join('|') !== 'baseURL|ignoreHTTPSErrors' ||
            options.ignoreHTTPSErrors !== false ||
            options.baseURL !== origin
          )
            throw Error('Strict owned browser context required');
          const row = manifest.profiles[index++];
          if (
            !row ||
            path.dirname(row.path) !== manifest.profileRoot ||
            fs.realpathSync(row.path) !== row.path ||
            fs.statSync(row.path).mode & 0o077 ||
            sha(row.path + '/cert9.db') !== row.cert9Sha256 ||
            fs.existsSync(row.path + '/cert_override.txt')
          )
            throw Error('Fresh private NSS profile refused');
          const current = (async () => {
            const context = await playwright.firefox.launchPersistentContext(row.path, {
              executablePath: executable,
              baseURL: options.baseURL,
              ignoreHTTPSErrors: false,
              firefoxUserPrefs: {
                'security.enterprise_roots.enabled': false,
                'network.proxy.type': 0,
              },
              env: {
                PATH: '/usr/bin:/bin',
                HOME: manifest.home,
                TMPDIR: manifest.tmp,
                LANG: 'C.UTF-8',
                TZ: 'UTC',
              },
            });
            active.add(context);
            if (closing) {
              await context.close();
              active.delete(context);
              throw Error('Owned browser facade closed during launch');
            }
            const close = context.close.bind(context);
            context.close = async (...args) => {
              await close(...args);
              active.delete(context);
            };
            return context;
          })();
          pending.add(current);
          void current.finally(() => pending.delete(current)).catch(() => {});
          return current;
        },
      };
      try {
        await use(facade);
      } finally {
        closing = true;
        const launches = await Promise.allSettled([...pending]);
        const retired = await Promise.allSettled([...active].map(context => context.close()));
        if (
          launches.some(row => row.status !== 'fulfilled') ||
          retired.some(row => row.status !== 'fulfilled') ||
          active.size
        )
          throw Error('Owned Firefox drain failed');
      }
    },
    { scope: 'worker' },
  ],
});
export { expect };
