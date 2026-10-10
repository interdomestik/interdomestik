// Test-only executable. There is deliberately no production CLI equivalent.
import fs from 'node:fs';
import path from 'node:path';
import { runGuardCli } from './db-access-evaluator.mjs';
const adoption = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), '.fixture-adoption.json'), 'utf8')
);
process.exitCode = runGuardCli({ repoRoot: process.cwd(), adoption, argv: process.argv.slice(2) });
