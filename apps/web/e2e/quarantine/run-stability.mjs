import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const listPath = resolve(__dirname, 'stability.list.txt');
const list = readFileSync(listPath, 'utf8')
  .split(/\r?\n/)
  .map(l => l.trim())
  .filter(l => l && !l.startsWith('#'));

if (list.length === 0) {
  console.error(`No entries found in ${listPath}`);
  process.exit(1);
}

// Pass through any CLI flags (e.g. --project=ks-sq --project=mk-mk)
const extraArgs = process.argv.slice(2);

const cmd = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const args = ['exec', 'playwright', 'test', ...list, ...extraArgs];

console.log(`Running stability suite (${list.length} files):`);
for (const f of list) console.log(`- ${f}`);

const result = spawnSync(cmd, args, {
  stdio: 'inherit',
  cwd: resolve(__dirname, '..', '..'), // apps/web
});

process.exit(result.status ?? 1);
