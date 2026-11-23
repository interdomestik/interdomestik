#!/usr/bin/env node
// Print the reviewed resolver record values of exact commits, for tenant-guard/resolver-baseline.mjs.
//   node scripts/ci/tenant-guard-resolver-record.mjs <commit>
//     prints the (S, B) pair of <commit>: the RESOLVER_BASELINE value.
//   node scripts/ci/tenant-guard-resolver-record.mjs <commit> --successor <base-commit> --id <id>
//     prints the RESOLVER_SUCCESSOR transition from <base-commit> to <commit>.
// Generation only: the guard never runs this, and a printed record is reviewed before it is pinned.
import {
  resolverPair,
  resolverRecordProblem,
  resolverTransition,
} from './tenant-guard/rules-resolver-state.mjs';
import { gitIdentity, readSchemaTree } from './tenant-guard/sources.mjs';

const args = process.argv.slice(2);
const option = name => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
const root = option('--root') ?? process.cwd();
const fail = message => {
  console.error(`tenant-guard-resolver-record: ${message}`);
  process.exit(1);
};
const [commit] = args;
if (!commit || commit.startsWith('--')) fail('usage: <commit> [--successor <base> --id <id>]');
const tree = readSchemaTree(root, gitIdentity(root, commit), 'record');
const baseCommit = option('--successor');
const value = baseCommit
  ? resolverTransition(
      readSchemaTree(root, gitIdentity(root, baseCommit), 'record-base'),
      tree,
      option('--id') ?? fail('--id is required with --successor')
    )
  : resolverPair(tree);
if (value.reason) fail(value.reason);
if (baseCommit) {
  const problem = resolverRecordProblem({ baseline: value.before, successor: value });
  if (problem) fail(problem);
}
process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
