#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { sonarConfiguration } from './z620-sonar-lib.mjs';
import { writeJson } from './z620-runner-lib.mjs';

const argument = process.argv.find(value => value.startsWith('--evidence-dir='));
if (!argument) throw new Error('--evidence-dir is required');
const evidenceDir = path.resolve(argument.slice('--evidence-dir='.length));
fs.mkdirSync(evidenceDir, { recursive: true, mode: 0o700 });
const configuration = sonarConfiguration();
const evidence = {
  status: configuration.status,
  missing: configuration.missing,
  host: configuration.host,
  project: configuration.project,
  tokenExposed: false,
  checkedAt: new Date().toISOString(),
};
writeJson(path.join(evidenceDir, 'sonar-preflight.json'), evidence);
console.log(JSON.stringify({ status: evidence.status, evidenceDir }));
if (configuration.status !== 'configured') process.exitCode = 2;
