import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { installArchive } from './db-access-crm-runtime-archive.mjs';
import { exact, hash } from './db-access-provider-runtime-identity.mjs';
import { crmDigest, failCrm } from './db-access-crm-proof-shape.mjs';

// Source-only dependency witnesses are authenticated but never imported or executed.
export function verifyCrmSourceDependencies({ contract, tarballRoot, assembly }) {
  const records = contract.sourceDependencies;
  if (!Array.isArray(records) || !records.length || records.length > 32)
    failCrm('source dependency inventory');
  const identities = new Set();
  const result = {};
  const run = (file, args) =>
    execFileSync(file, args, {
      encoding: 'utf8',
      timeout: 30000,
      maxBuffer: 32 * 1024 * 1024,
      env: { PATH: '/usr/bin:/bin', LANG: 'C', TZ: 'UTC' },
    });
  for (const record of records) {
    const key = record.name + '@' + record.version;
    if (identities.has(key) || !Object.keys(record.files ?? {}).length)
      failCrm('duplicate or empty source dependency');
    identities.add(key);
    const directory = path.join(assembly, 'crm-source-' + hash(key));
    fs.mkdirSync(directory);
    const archive = installArchive({
      archives: path.join(tarballRoot, 'crm-source'),
      record,
      directory,
      run,
    });
    const files = {};
    for (const [file, expected] of Object.entries(record.files))
      files[file] = hash(exact(directory, file, expected));
    result[key] = { ...archive, filesSha256: crmDigest(files) };
  }
  return result;
}
