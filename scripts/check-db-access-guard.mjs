import fs from 'node:fs';
import path from 'node:path';
import { ADOPTION } from './ci/db-access-adoption.mjs';
import { RESOLVER_SNAPSHOT } from './ci/db-access-resolver-snapshot.mjs';
// Unpinned synthetic countermodel only: observable if a floating source ref wrongly executes.
const report = process.argv.find(value => value.startsWith('--report='))?.slice(9);
if (!report) throw new Error('synthetic countermodel report argument missing');
fs.mkdirSync(path.dirname(report), { recursive: true });
fs.writeFileSync(report, JSON.stringify({ status: 'pass', scannedCount: 1, newCount: 0, failingNewEntries: [], incomplete: [] }) + '\n');
console.log('SOURCE_REF_ADVANCE_FORGED_ENTRY_EXECUTED', ADOPTION.commit, RESOLVER_SNAPSHOT.id);
