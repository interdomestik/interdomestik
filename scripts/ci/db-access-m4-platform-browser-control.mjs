// Fixed executed diagnostic, never a registration API or an accepted completion file.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { readFixed, sha, ownedDirectory } from './db-access-m4-platform-custody.mjs';
const [file] = process.argv.slice(2),
  row = JSON.parse(readFixed(file, 32768));
const errors = {
  'wrong-ca': /SEC_ERROR_UNKNOWN_ISSUER|MOZILLA_PKIX_ERROR_SELF_SIGNED_CERT/u,
  'wrong-host': /SSL_ERROR_BAD_CERT_DOMAIN/u,
  expired: /SEC_ERROR_EXPIRED_CERTIFICATE|SEC_ERROR_EXPIRED_ISSUER_CERTIFICATE/u,
  plaintext: /SSL_ERROR_RX_RECORD_TOO_LONG|SSL_ERROR_RX_UNEXPECTED/u,
};
if (!['good', ...Object.keys(errors)].includes(row.kind)) throw Error('Fixed browser control');
const origin = new URL(row.origin);
if (
  origin.protocol !== 'https:' ||
  origin.hostname !== '127.0.0.1' ||
  !origin.port ||
  origin.pathname !== '/' ||
  origin.search ||
  origin.hash ||
  origin.username ||
  origin.password
)
  throw Error('Owned browser control origin');
ownedDirectory(row.profile.path);
ownedDirectory(row.home);
ownedDirectory(row.tmp);
if (
  sha(readFixed(path.join(row.profile.path, 'cert9.db'))) !== row.profile.cert9Sha256 ||
  fs.existsSync(path.join(row.profile.path, 'cert_override.txt')) ||
  sha(readFixed(row.executable)) !== row.executableSha256
)
  throw Error('Pinned strict browser control');
const require = createRequire(path.join(row.project, 'package.json'));
const module = fs.realpathSync(require.resolve('@playwright/test'));
if (!module.startsWith(row.project + '/.packages/'))
  throw Error('Owned Playwright package required');
const { firefox } = require(module);
const context = await firefox.launchPersistentContext(row.profile.path, {
  executablePath: row.executable,
  ignoreHTTPSErrors: false,
  firefoxUserPrefs: {
    'security.enterprise_roots.enabled': false,
    'network.proxy.type': 0,
  },
  env: {
    PATH: '/usr/bin:/bin',
    HOME: row.home,
    TMPDIR: row.tmp,
    LANG: 'C.UTF-8',
    TZ: 'UTC',
  },
});
let posts = 0,
  observed;
try {
  const page = await context.newPage();
  page.on('request', request => {
    if (request.method() === 'POST') posts++;
  });
  if (row.kind === 'good') {
    const response = await page.goto(origin.origin + '/', {
      timeout: 10000,
      waitUntil: 'domcontentloaded',
    });
    const details = await response.securityDetails();
    if (
      response.status() !== 200 ||
      !(await page.locator('body').textContent()).includes(
        'Separate M4 qualification image. No public application or production C credit.'
      ) ||
      !/^TLS 1\.[23]$/u.test(details?.protocol ?? '')
    )
      throw Error('Real strict HTTPS root failed');
    observed = { status: 200, protocol: details.protocol };
  } else {
    let failure;
    try {
      await page.goto(origin.origin + '/', {
        timeout: 10000,
        waitUntil: 'domcontentloaded',
      });
    } catch (error) {
      failure = error;
    }
    const match = failure?.message?.match(errors[row.kind]);
    if (!match) throw Error('Intended TLS refusal missing');
    observed = { error: match[0] };
  }
  if (posts !== 0) throw Error('TLS control dispatched an action');
} finally {
  await context.close();
}
if (fs.existsSync(path.join(row.profile.path, 'cert_override.txt')))
  throw Error('TLS override appeared');
process.stdout.write(JSON.stringify({ kind: row.kind, observed, posts, closed: true }) + '\n');
