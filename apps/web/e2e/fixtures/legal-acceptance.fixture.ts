import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { promisify } from 'node:util';

export type FixtureMember = { id: string; tenantId: string; email: string; legacyEmail?: string };

const databaseRoot = join(__dirname, '../../../../packages/database');
const runner = join(databaseRoot, 'test/legal-acceptance-fixture.test-support.ts');
const run = promisify(execFile);

// Use the guarded seed tool from a child process to keep it outside the application's imports.
export async function fixtureLegalAcceptance(
  mode: 'seed' | 'clean',
  members: readonly FixtureMember[]
): Promise<void> {
  await run(process.execPath, ['--import', 'tsx', runner, mode, JSON.stringify(members)], {
    cwd: databaseRoot,
    timeout: 30_000,
  });
}
