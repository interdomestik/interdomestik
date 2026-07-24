#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

import { issuePermit } from './z620-push-permit-lib.mjs';

const args = Object.fromEntries(
  process.argv.slice(2).map(argument => {
    const [key, ...value] = argument.replace(/^--/u, '').split('=');
    return [key, value.join('=') || true];
  })
);
const inputPath = path.resolve(String(args.input ?? 'permit-input.json'));
const outputPath = path.resolve(String(args.output ?? 'push-permit.json'));
const ttlMs = Number(args['ttl-ms'] ?? 30 * 60_000);
const input = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
const permit = issuePermit(input, {
  key: process.env.Z620_PERMIT_SIGNING_KEY,
  ttlMs,
});

fs.mkdirSync(path.dirname(outputPath), { recursive: true, mode: 0o700 });
fs.writeFileSync(outputPath, `${JSON.stringify(permit, null, 2)}\n`, { mode: 0o600 });
console.log(JSON.stringify({ status: 'issued', sha: permit.sha, output: outputPath }));
