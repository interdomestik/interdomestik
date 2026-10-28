// Run in root-owned serialized TLS-control phases against the same frozen Next entry.
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { readOwned } from '../image-custody.mjs';
const value = JSON.parse(readOwned(process.env.M4_COMPILED_TLS_CONTROL_FILE, 16384, true));
const kinds = new Map([
  ['wrong-ca', /SEC_ERROR_UNKNOWN_ISSUER|MOZILLA_PKIX_ERROR_SELF_SIGNED_CERT/u],
  ['wrong-host', /SSL_ERROR_BAD_CERT_DOMAIN/u],
  ['expired', /SEC_ERROR_EXPIRED_CERTIFICATE|SEC_ERROR_EXPIRED_ISSUER_CERTIFICATE/u],
  ['plaintext', /SSL_ERROR_RX_RECORD_TOO_LONG|SSL_ERROR_RX_UNEXPECTED/u],
]);
const root = '/Volumes/Dev2TB/interdomestik/proofs/m4-compiled-browser-firefox-v1';
const sha = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const origin = new URL(value.origin);
const output = process.env.M4_COMPILED_BROWSER_OUTPUT;
if (
  !output ||
  fs.realpathSync(output) !== output ||
  fs.statSync(output).mode & 0o077 ||
  value.outputFile !== output + '/tls-' + value.kind + '.json' ||
  origin.origin !== new URL(process.env.M4_COMPILED_FIXTURE_ORIGIN).origin
)
  throw Error('Owned TLS output/origin refused');
if (
  value.version !== 1 ||
  !kinds.has(value.kind) ||
  origin.protocol !== 'https:' ||
  origin.hostname !== '127.0.0.1' ||
  origin.pathname !== '/' ||
  origin.search ||
  origin.hash ||
  origin.username ||
  origin.password ||
  !value.profile.startsWith(root + '/profiles/') ||
  fs.realpathSync(value.profile) !== value.profile ||
  fs.statSync(value.profile).mode & 0o077 ||
  sha(value.profile + '/cert9.db') !== value.cert9Sha256 ||
  fs.existsSync(value.profile + '/cert_override.txt') ||
  !value.executable.startsWith(root + '/store/firefox-1543/') ||
  fs.realpathSync(value.executable) !== value.executable ||
  sha(value.executable) !== value.executableSha256 ||
  !['caSha256', 'leafSha256'].every(key => /^[a-f0-9]{64}$/u.test(value[key] ?? ''))
)
  throw Error('Owned TLS-control identity refused');
test('exact browser TLS refusal: ' + value.kind, async ({ playwright }) => {
  const context = await playwright.firefox.launchPersistentContext(value.profile, {
    executablePath: value.executable,
    ignoreHTTPSErrors: false,
    firefoxUserPrefs: { 'security.enterprise_roots.enabled': false },
    env: {
      PATH: '/usr/bin:/bin',
      HOME: root + '/home',
      TMPDIR: root + '/tmp',
      LANG: 'C.UTF-8',
      TZ: 'UTC',
    },
  });
  try {
    const page = await context.newPage();
    let refusal;
    try {
      await page.goto(origin.origin + '/', { timeout: 10000, waitUntil: 'domcontentloaded' });
    } catch (error) {
      refusal = error;
    }
    expect(refusal).toBeTruthy();
    expect(refusal.message).toMatch(kinds.get(value.kind));
    fs.writeFileSync(
      value.outputFile,
      JSON.stringify({
        version: 1,
        kind: value.kind,
        origin: origin.origin,
        browserRevision: '1543',
        exactTLSClassMatched: true,
        caSha256: value.caSha256,
        leafSha256: value.leafSha256,
        SQLExecuted: false,
        nativeAdmission: false,
        productionCCredit: 0,
      }) + '\n',
      { flag: 'wx', mode: 0o600 }
    );
  } finally {
    await context.close();
  }
});
