#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { deriveCredential, mutateAccounts, registryFingerprint } from '../server/admin/account-mutations.mjs';
import { parseAccountRegistry } from '../server/auth/account-registry.mjs';
import { applyRegistry, assertProjectPin, readRemoteRegistry } from '../server/admin/vercel-client.mjs';

const TOOL_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function option(args, name) {
  const index = args.indexOf(name);
  return index < 0 ? undefined : args[index + 1];
}

export function parseAdminArgs(args) {
  const [action] = args;
  if (!['add', 'rotate', 'disable', 'invalidate', 'check'].includes(action)) throw new TypeError('Invalid action.');
  if (args.includes('--password')) throw new TypeError('Password must be supplied through protected stdin.');
  const result = {
    action, username: option(args, '--username'), apply: args.includes('--apply'),
    expectedFingerprint: option(args, '--expected-fingerprint'),
  };
  if (args.includes('--password-stdin')) result.passwordStdin = true;
  if (result.apply && !result.expectedFingerprint) throw new TypeError('Apply requires --expected-fingerprint.');
  return result;
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8').replace(/[\r\n]+$/u, '');
}

export async function runAdmin(args, env = process.env) {
  const options = parseAdminArgs(args);
  if (options.apply && option(args, '--registry-file')) throw new Error('Apply reads only the pinned remote registry.');
  if (options.apply) {
    const project = JSON.parse(await readFile(resolve(TOOL_ROOT, '.vercel/project.json'), 'utf8'));
    assertProjectPin(project);
  }
  const source = options.apply
    ? await readRemoteRegistry({ cwd: TOOL_ROOT })
    : option(args, '--registry-file')
      ? await readFile(option(args, '--registry-file'), 'utf8')
      : env.REVIEW_PORTAL_ACCOUNTS_JSON;
  if (!source) throw new Error('Registry input is required.');
  const accounts = JSON.parse(source);
  const validated = [...parseAccountRegistry(source).byId.values()];
  if (options.action === 'check') return { mode: 'check', fingerprint: registryFingerprint(validated) };
  let operation = options;
  if (['add', 'rotate'].includes(options.action)) {
    if (!options.passwordStdin) throw new Error('Use --password-stdin.');
    const password = await deriveCredential(await readStdin());
    operation = options.action === 'add'
      ? { ...options, account: { ...JSON.parse(option(args, '--account-json') ?? '{}'), password } }
      : { ...options, password };
  }
  const updated = mutateAccounts(accounts, operation);
  if (options.apply) {
    const json = JSON.stringify(updated);
    const result = await applyRegistry({
      json, expectedFingerprint: options.expectedFingerprint,
      readRemote: () => readRemoteRegistry({ cwd: TOOL_ROOT }),
    });
    return { mode: 'applied', action: options.action, fingerprint: result.fingerprint };
  }
  return { mode: 'dry-run', action: options.action, fingerprint: registryFingerprint(updated) };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  runAdmin(process.argv.slice(2)).then(result => process.stdout.write(`${JSON.stringify(result)}\n`)).catch(error => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
