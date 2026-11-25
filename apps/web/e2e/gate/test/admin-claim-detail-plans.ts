import type { TestInfo } from '@playwright/test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { promisify } from 'node:util';
import type { CheckoutTiming } from './admin-claim-detail-query-probe';

export type ClaimReadFixture = {
  prefix: string;
  home: string;
  access: string;
  branchA: string;
  branchB: string;
  localId: string;
  transferredId: string;
  wrongBranchId: string;
  staffAfter: string;
};

export type CapturedQuery = { text: string; binds: unknown[] };
type ExplainNode = {
  'Actual Rows': number;
  'Actual Loops': number;
  'Shared Hit Blocks': number;
  'Shared Read Blocks': number;
};
type Explain = { Plan: ExplainNode; 'Execution Time': number; 'Planning Time': number };

export const documentId = (claimId: string, index: number, width = 2) =>
  `${claimId}-doc-${String(index).padStart(width, '0')}`;

export type ClaimDetailReader =
  typeof import('@interdomestik/domain-documents/claim-documents').readOpsClaimDetailData;
export type FixtureController = typeof import('@interdomestik/database/db').dbRls.$client;

export function assertPage(
  documents: NonNullable<Awaited<ReturnType<ClaimDetailReader>>>['documents'],
  ids: string[],
  nextCursor: string | null
) {
  assert.equal(documents.kind, 'page');
  assert.deepEqual(
    documents.items.map(item => item.id),
    ids
  );
  assert.equal(documents.nextCursor, nextCursor);
}

// Fixed before the run. Both ceilings apply to every document case. One warm-up is discarded.
// The buffer ceiling detects scans in a warm cache. The execution budget is per SQL statement.
const DOCUMENT_BUDGET = {
  measuredRuns: 5,
  p75ExecutionMs: 10,
  maxSharedBlocks: 128,
};

export async function measureRead(
  run: (text: string, binds: unknown[]) => PromiseLike<{ 'QUERY PLAN': Explain[] }[]>,
  query: CapturedQuery,
  label: string,
  checkout: CheckoutTiming | undefined
) {
  assert.ok(checkout, `WP-19 ${label} is missing pool timing`);
  const explain = async () => {
    // Replay the driver's captured statement and untouched binds on the same checked-out
    // connection, role and transaction-local settings that produced the original result.
    const [row] = await run(`explain (analyze, buffers, format json) ${query.text}`, query.binds);
    const plan = row?.['QUERY PLAN']?.[0];
    if (
      !plan ||
      !Number.isFinite(plan['Execution Time']) ||
      !Number.isFinite(plan.Plan['Shared Hit Blocks']) ||
      !Number.isFinite(plan.Plan['Shared Read Blocks'])
    ) {
      throw new Error(`WP-19 ${label} returned incomplete EXPLAIN metrics`);
    }
    return plan;
  };

  await explain();
  const plans: Explain[] = [];
  for (let index = 0; index < DOCUMENT_BUDGET.measuredRuns; index++) {
    plans.push(await explain());
  }
  const timings = plans.map(plan => plan['Execution Time']).sort((a, b) => a - b);
  const p75Ms = timings[Math.ceil(timings.length * 0.75) - 1];
  const sharedBlocks = Math.max(
    ...plans.map(({ Plan: node }) => node['Shared Hit Blocks'] + node['Shared Read Blocks'])
  );
  const passed =
    label.startsWith('staff/') ||
    (p75Ms <= DOCUMENT_BUDGET.p75ExecutionMs && sharedBlocks <= DOCUMENT_BUDGET.maxSharedBlocks);

  return { label, passed, p75Ms, sharedBlocks, ...checkout, query, plans };
}

export async function runRestrictedClaimReader(info: TestInfo, fixture: ClaimReadFixture) {
  if (!info.config.configFile) throw new Error('WP-19 requires the web Playwright config');
  const webRoot = dirname(info.config.configFile);
  const tsx = createRequire(resolve(webRoot, '../../package.json')).resolve('tsx/cli');
  const reader = resolve(webRoot, 'e2e/gate/test/admin-claim-detail-restricted-reader.ts');
  const command = promisify(execFile);
  let stdout: string;
  try {
    ({ stdout } = await command(process.execPath, [tsx, reader, JSON.stringify(fixture)], {
      cwd: webRoot,
      env: { ...process.env, NODE_ENV: 'test' },
      timeout: 100_000,
      maxBuffer: 8 * 1024 * 1024,
    }));
  } catch (error) {
    // Never forward the child command, driver errors, bind dumps or environment.
    const stderr = (error as { stderr?: string }).stderr ?? '';
    const location = /WP19_ERROR [\w.-]+\.ts:\d+:\d+/u.exec(stderr)?.[0];
    throw new Error(location ?? 'WP-19 restricted reader did not complete');
  }
  const reportLine = stdout.split('\n').find(line => line.startsWith('WP19_RESULT '));
  if (!reportLine) throw new Error('WP-19 restricted reader produced no result');
  const body = reportLine.slice('WP19_RESULT '.length);
  const report = JSON.parse(body);
  if (
    report.restricted !== true ||
    !Array.isArray(report.misses) ||
    !report.misses.every((miss: unknown) => typeof miss === 'string')
  ) {
    throw new Error('WP-19 restricted reader produced an invalid result');
  }
  await info.attach('wp19-restricted-read-evidence', { body, contentType: 'application/json' });
  if (report.misses.length) {
    throw new Error(`WP-19 document query budget missed: ${report.misses.join(', ')}`);
  }
}

export { DOCUMENT_BUDGET };
