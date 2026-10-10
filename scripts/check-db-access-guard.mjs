#!/usr/bin/env node
import { runGuardCli } from './ci/db-access-evaluator.mjs';

// Trust comes from the root-reviewed adoption constant, never command-line/environment input.
process.exitCode = runGuardCli({ repoRoot: process.cwd(), argv: process.argv.slice(2) });
