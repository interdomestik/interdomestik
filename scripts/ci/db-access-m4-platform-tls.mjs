import fs from 'node:fs';
import path from 'node:path';
import { X509Certificate } from 'node:crypto';
import { runOwned } from './db-access-m4-platform-process.mjs';
import {
  sha,
  readFixed,
  writePrivate,
  databaseCA,
  ownedDirectory,
} from './db-access-m4-platform-custody.mjs';
import { verifyPlatformTools, platformTools } from './db-access-m4-platform-tools.mjs';

export async function preparePlatformTLS(state, suppliedDatabaseCA) {
  const databasePem = databaseCA(suppliedDatabaseCA);
  verifyPlatformTools();
  const privateRoot = path.join(state.layout['driver-evidence'], 'issuer');
  fs.mkdirSync(privateRoot, { mode: 0o700 });
  fs.mkdirSync(path.join(privateRoot, 'issued'), { mode: 0o700 });
  for (const [name, value] of [
    ['index.txt', ''],
    ['index.txt.attr', 'unique_subject = no\n'],
    ['serial', '1000\n'],
  ])
    writePrivate(privateRoot, name, value);
  if (/[\r\n$]/u.test(privateRoot)) throw Error('OpenSSL private path refused');
  const config = writePrivate(
    privateRoot,
    'openssl.cnf',
    `[ req ]
prompt = no
distinguished_name = dn
[ dn ]
CN = M4 Fresh Runtime CA
[ ca ]
default_ca = local
[ local ]
dir = ${privateRoot}
database = $dir/index.txt
serial = $dir/serial
new_certs_dir = $dir/issued
certificate = $dir/ca.pem
private_key = $dir/ca.key
default_md = sha256
default_days = 2
unique_subject = no
policy = named
[ named ]
commonName = supplied
[ ca_ext ]
basicConstraints = critical,CA:true
keyUsage = critical,keyCertSign,cRLSign
subjectKeyIdentifier = hash
[ good ]
basicConstraints = critical,CA:false
keyUsage = critical,digitalSignature,keyEncipherment
extendedKeyUsage = serverAuth
subjectKeyIdentifier = hash
authorityKeyIdentifier = keyid,issuer
subjectAltName = IP:127.0.0.1
[ wrong ]
basicConstraints = critical,CA:false
keyUsage = critical,digitalSignature,keyEncipherment
extendedKeyUsage = serverAuth
subjectKeyIdentifier = hash
authorityKeyIdentifier = keyid,issuer
subjectAltName = IP:127.0.0.2
`
  );
  const execute = async args =>
    runOwned(
      {
        argv: [platformTools.openssl, ...args],
        cwd: privateRoot,
        env: state.cleanEnv,
      },
      state.deadlineAt
    );
  for (const name of ['ca', 'foreign', 'next', 'backend']) {
    await execute(['genrsa', '-out', path.join(privateRoot, name + '.key'), '2048']);
    fs.chmodSync(path.join(privateRoot, name + '.key'), 0o600);
  }
  for (const name of ['ca', 'foreign'])
    await execute([
      'req',
      '-new',
      '-x509',
      '-key',
      path.join(privateRoot, name + '.key'),
      '-out',
      path.join(privateRoot, name + '.pem'),
      '-days',
      '2',
      '-sha256',
      '-config',
      config,
      '-extensions',
      'ca_ext',
      '-subj',
      '/CN=M4 ' + name + ' Fresh Runtime CA',
    ]);
  for (const name of ['next', 'backend']) {
    await execute([
      'req',
      '-new',
      '-key',
      path.join(privateRoot, name + '.key'),
      '-out',
      path.join(privateRoot, name + '.csr'),
      '-config',
      config,
      '-subj',
      '/CN=M4 ' + name + ' Runtime',
    ]);
    const variants = name === 'next' ? ['good', 'wrong-host', 'expired'] : ['backend'];
    for (const variant of variants)
      await execute([
        'ca',
        '-batch',
        '-notext',
        '-config',
        config,
        '-in',
        path.join(privateRoot, name + '.csr'),
        '-out',
        path.join(privateRoot, variant + '.pem'),
        '-extensions',
        variant === 'wrong-host' ? 'wrong' : 'good',
        ...(variant === 'expired'
          ? ['-startdate', '000101000000Z', '-enddate', '000102000000Z']
          : []),
      ]);
  }
  const ca = readFixed(path.join(privateRoot, 'ca.pem')),
    issuer = new X509Certificate(ca);
  const foreign = readFixed(path.join(privateRoot, 'foreign.pem'));
  if (!issuer.ca || issuer.fingerprint256 === new X509Certificate(foreign).fingerprint256)
    throw Error('Independent platform CA required');
  const leaves = {};
  for (const kind of ['good', 'wrong-host', 'expired', 'backend']) {
    const pem = readFixed(path.join(privateRoot, kind + '.pem')),
      cert = new X509Certificate(pem);
    const valid = Date.parse(cert.validFrom) <= Date.now() && Date.parse(cert.validTo) > Date.now();
    if (
      cert.ca ||
      !cert.verify(issuer.publicKey) ||
      !cert.checkIssued(issuer) ||
      (cert.checkIP('127.0.0.1') === '127.0.0.1') !== (kind !== 'wrong-host') ||
      valid !== (kind !== 'expired')
    )
      throw Error('Finite TLS certificate law refused');
    leaves[kind] = { pem, sha256: sha(pem) };
  }
  const nextKey = readFixed(path.join(privateRoot, 'next.key'));
  const backendKey = readFixed(path.join(privateRoot, 'backend.key'));
  if (sha(nextKey) === sha(backendKey)) throw Error('Distinct private keys required');
  const next = {
    keyFile: writePrivate(state.layout['next-inputs'], 'next.key', nextKey),
    caFile: writePrivate(state.layout['next-inputs'], 'owner-ca.pem', ca),
    certFiles: Object.fromEntries(
      ['good', 'wrong-host', 'expired'].map(kind => [
        kind,
        writePrivate(state.layout['next-inputs'], kind + '.pem', leaves[kind].pem),
      ])
    ),
  };
  const backend = {
    caFile: writePrivate(
      state.layout['backend-inputs'],
      'trust.pem',
      Buffer.concat([ca, Buffer.from('\n' + databasePem)])
    ),
    tls: { key: backendKey.toString(), cert: leaves.backend.pem.toString() },
  };
  const profiles = [];
  for (let index = 0; index < 9; index++) {
    const profile = path.join(state.layout['browser-profiles'], 'case-' + index);
    fs.mkdirSync(profile, { mode: 0o700 });
    ownedDirectory(profile);
    const caFile = writePrivate(
      state.layout['browser-inputs'],
      'ca-' + index + '.pem',
      index === 1 ? foreign : ca
    );
    const nss = async args =>
      runOwned(
        {
          argv: [platformTools.certutil, ...args],
          cwd: profile,
          env: state.cleanEnv,
        },
        state.deadlineAt
      );
    await nss(['-N', '--empty-password', '-d', 'sql:' + profile]);
    await nss([
      '-A',
      '-d',
      'sql:' + profile,
      '-n',
      'm4-owned-loopback-ca',
      '-t',
      'C,,',
      '-i',
      caFile,
    ]);
    const exported = await nss(['-L', '-d', 'sql:' + profile, '-n', 'm4-owned-loopback-ca', '-a']);
    if (
      !new X509Certificate(exported.stdout).raw.equals(
        new X509Certificate(index === 1 ? foreign : ca).raw
      )
    )
      throw Error('Actual NSS CA export mismatch');
    profiles.push({
      path: profile,
      cert9Sha256: sha(readFixed(path.join(profile, 'cert9.db'))),
      caSha256: sha(index === 1 ? foreign : ca),
    });
  }
  // Issuer keys remain only in driver evidence. Never give Next this directory or those keys.
  return {
    next,
    backend,
    profiles,
    issuerSha256: sha(ca),
    databaseCASha256: sha(databasePem),
    leafHashes: Object.fromEntries(
      Object.entries(leaves).map(([key, value]) => [key, value.sha256])
    ),
  };
}
export async function verifyPlatformNssAfter(state) {
  const rows = [];
  for (const [index, profile] of state.tls.profiles.entries()) {
    ownedDirectory(profile.path);
    if (fs.existsSync(path.join(profile.path, 'cert_override.txt')))
      throw Error('Firefox certificate exception appeared');
    const result = await runOwned(
      {
        argv: [
          platformTools.certutil,
          '-L',
          '-d',
          'sql:' + profile.path,
          '-n',
          'm4-owned-loopback-ca',
          '-a',
        ],
        cwd: profile.path,
        env: state.cleanEnv,
      },
      state.deadlineAt
    );
    const before = readFixed(path.join(state.layout['browser-inputs'], 'ca-' + index + '.pem'));
    if (
      !new X509Certificate(result.stdout).raw.equals(new X509Certificate(before).raw) ||
      sha(before) !== profile.caSha256
    )
      throw Error('Actual private NSS trust changed');
    rows.push({
      path: profile.path,
      caSha256: profile.caSha256,
      cert9Before: profile.cert9Sha256,
      cert9After: sha(readFixed(path.join(profile.path, 'cert9.db'))),
      certificateExceptionAbsent: true,
    });
  }
  return rows;
}
