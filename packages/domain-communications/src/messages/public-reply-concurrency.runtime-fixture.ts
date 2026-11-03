/** Private SQL fixture: two independently authenticated processes call the actual reply operation. */
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { preparePublicReplyNotification } from './public-reply-notification';

// The authority token cannot cross a process boundary; each worker mints its own from tenantId.
type Params = Omit<Parameters<typeof preparePublicReplyNotification>[0], 'authority'> & {
  tenantId: string;
};
type Observation = {
  status: 'created' | 'skipped';
  reason?: string;
  pid: number;
  sessionUser: string;
  currentUser: string;
  sessionSuper: boolean;
  sessionBypass: boolean;
  currentSuper: boolean;
  currentBypass: boolean;
};

export async function runReplyPreparationWorkers(url: string, role: string, params: Params) {
  // Fixed full tsx loader (CJS and ESM hooks) of the pinned root install, by literal file URL.
  // tsx/esm alone cannot load extensionless CommonJS dependencies; no runtime resolver is used.
  const loader = new URL('../../../../node_modules/tsx/dist/loader.mjs', import.meta.url);
  const source = fileURLToPath(
    new URL('./public-reply-concurrency-worker.test-support.ts', import.meta.url)
  );
  const env: NodeJS.ProcessEnv = {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    // No temp directory is shared with the worker: tsx compiles in memory instead of caching.
    TSX_DISABLE_CACHE: '1',
    NODE_ENV: 'test',
    NODE_OPTIONS: '--max-old-space-size=512',
    DATABASE_URL: url,
    DATABASE_URL_RLS: url,
    DB_RLS_ROLE: role,
    REQUIRE_RLS_INTEGRATION: '1',
    DB_MAX_CONNECTIONS: '1',
  };
  const run = () =>
    new Promise<Observation>((resolve, reject) => {
      const child = execFile(
        process.execPath,
        ['--import', loader.href, source],
        {
          encoding: 'utf8',
          env,
          timeout: 45_000,
          maxBuffer: 256 * 1024,
        },
        (error, stdout) => {
          if (error) return reject(new Error('Restricted reply worker failed'));
          const line = stdout.split('\n').find(value => value.startsWith('S8_REPLY_RESULT '));
          if (!line) return reject(new Error('Missing restricted reply observation'));
          try {
            resolve(JSON.parse(line.slice('S8_REPLY_RESULT '.length)));
          } catch {
            reject(new Error('Invalid restricted reply observation'));
          }
        }
      );
      child.stdin?.end(JSON.stringify(params));
    });
  // Logical invocations start together, on separate physical sessions. No forced SQL overlap claim.
  const outcomes = await Promise.allSettled([run(), run()]);
  const failed = outcomes.find(value => value.status === 'rejected');
  if (failed?.status === 'rejected') throw failed.reason;
  return outcomes.map(value => {
    if (value.status !== 'fulfilled') throw new Error('Missing reply worker result');
    return value.value;
  });
}
