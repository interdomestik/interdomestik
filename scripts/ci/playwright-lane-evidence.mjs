#!/usr/bin/env node
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { runCli } from './playwright-lane-evidence-cli.mjs';

export { runCli } from './playwright-lane-evidence-cli.mjs';
export {
  playwrightReportArgs,
  summarizePlaywrightReport,
} from './playwright-lane-evidence-policy.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_PATH) {
  try {
    runCli(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
