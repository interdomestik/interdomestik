// Local qualification fixture only. Return values are secrets for the restricted child IPC.
import { spawnSync } from 'node:child_process';
import { createPrivateKey, createPublicKey, X509Certificate } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const OPENSSL = '/usr/bin/openssl';
const MAX_BYTES = 16 * 1024;
const CONFIG = `[req]
prompt = no
distinguished_name = subject
x509_extensions = extensions
[subject]
CN = localhost
[extensions]
basicConstraints = critical,CA:FALSE
keyUsage = critical,digitalSignature,keyEncipherment
extendedKeyUsage = serverAuth
subjectAltName = @names
[names]
DNS.1 = localhost
IP.1 = 127.0.0.1
`;
const refuse = () => {
  throw new Error('M4 local TLS fixture refused');
};

// Pure shape checks do not grant production trust or mint runtime authority.
export function validateM4RuntimeFixtureTls(key, cert) {
  if (
    typeof key !== 'string' ||
    typeof cert !== 'string' ||
    Buffer.byteLength(key) > MAX_BYTES ||
    Buffer.byteLength(cert) > MAX_BYTES
  )
    refuse();
  try {
    const privateKey = createPrivateKey(key);
    const x509 = new X509Certificate(cert);
    const actual = createPublicKey(privateKey).export({
      type: 'spki',
      format: 'der',
    });
    const expected = x509.publicKey.export({ type: 'spki', format: 'der' });
    const start = Date.parse(x509.validFrom),
      end = Date.parse(x509.validTo),
      now = Date.now();
    if (
      privateKey.asymmetricKeyType !== 'rsa' ||
      privateKey.asymmetricKeyDetails.modulusLength < 2048 ||
      !actual.equals(expected) ||
      x509.ca ||
      x509.subject !== x509.issuer ||
      !x509.verify(x509.publicKey) ||
      x509.checkHost('localhost') !== 'localhost' ||
      x509.checkIP('127.0.0.1') !== '127.0.0.1' ||
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      start > now ||
      end <= now ||
      end - start > 25 * 60 * 60 * 1000
    )
      refuse();
  } catch {
    refuse();
  }
}

function readOwned(file) {
  const stat = fs.lstatSync(file);
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    fs.realpathSync(file) !== file ||
    stat.uid !== process.getuid() ||
    (stat.mode & 0o777) !== 0o600 ||
    stat.size <= 0 ||
    stat.size > MAX_BYTES
  )
    refuse();
  return fs.readFileSync(file, 'utf8');
}

export function createM4RuntimeFixtureTls() {
  const parent = fs.realpathSync(os.tmpdir());
  const dir = fs.mkdtempSync(path.join(parent, 'm4-local-tls-'));
  try {
    const stat = fs.lstatSync(dir);
    if (
      !stat.isDirectory() ||
      stat.isSymbolicLink() ||
      fs.realpathSync(dir) !== dir ||
      stat.uid !== process.getuid() ||
      (stat.mode & 0o777) !== 0o700
    )
      refuse();
    const keyPath = path.join(dir, 'key.pem');
    const certPath = path.join(dir, 'cert.pem');
    const configPath = path.join(dir, 'openssl.cnf');
    for (const file of [keyPath, certPath, configPath])
      fs.writeFileSync(file, '', { flag: 'wx', mode: 0o600 });
    fs.writeFileSync(configPath, CONFIG, { mode: 0o600 });
    const result = spawnSync(
      OPENSSL,
      [
        'req',
        '-x509',
        '-newkey',
        'rsa:2048',
        '-nodes',
        '-sha256',
        '-days',
        '1',
        '-batch',
        '-config',
        configPath,
        '-keyout',
        keyPath,
        '-out',
        certPath,
      ],
      {
        env: { HOME: dir, LANG: 'C', LC_ALL: 'C' },
        cwd: dir,
        stdio: ['ignore', 'pipe', 'pipe'],
        maxBuffer: 8192,
        timeout: 10000,
        windowsHide: true,
      }
    );
    if (result.error || result.signal || result.status !== 0) refuse();
    const key = readOwned(keyPath),
      cert = readOwned(certPath);
    validateM4RuntimeFixtureTls(key, cert);
    return Object.freeze({ key, cert, ca: cert });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
