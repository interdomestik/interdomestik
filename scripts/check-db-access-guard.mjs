#!/usr/bin/env node
import { runGuardCliParallel } from './ci/db-access-evaluator.mjs';

// Trust comes from the root-reviewed adoption constant, never command-line/environment input.
process.exitCode = await runGuardCliParallel({
  repoRoot: process.cwd(),
  argv: process.argv.slice(2),
});
