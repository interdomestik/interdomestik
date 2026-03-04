import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { buildMemoryIndex } from './memory-index.mjs';
import { retrieveAdvisoryLessons } from './memory-retrieve.mjs';

function makeRecord(overrides) {
  return {
    id: 'mem_default',
    status: 'candidate',
    store_type: 'procedural',
    trigger_signature: 'release_gate.no_go',
    risk_class: 'high',
    scope: { tenant: 'tenant_mk', file_path: 'scripts/release-gate/run.ts' },
    lesson: 'Do not skip release gate checks.',
    verification_commands: ['pnpm release:gate:prod'],
    promotion_rule: 'hitl_required',
    ...overrides,
  };
}

test('retrieval is deterministic by score then status', () => {
  const records = [
    makeRecord({ id: 'mem_canonical', status: 'canonical' }),
    makeRecord({ id: 'mem_candidate', status: 'candidate' }),
    makeRecord({
      id: 'mem_validated',
      status: 'validated',
      scope: { tenant: 'tenant_sq', file_path: 'scripts/release-gate/run.ts' },
    }),
  ];

  const index = buildMemoryIndex(records);
  const result = retrieveAdvisoryLessons({
    records,
    index,
    query: {
      trigger_signature: 'release_gate.no_go',
      scope: { tenant: 'tenant_mk' },
    },
    limit: 10,
  });

  assert.equal(result.count, 3);
  assert.deepEqual(
    result.hits.map(hit => hit.id),
    ['mem_canonical', 'mem_candidate', 'mem_validated']
  );
  assert.deepEqual(
    result.hits.map(hit => hit.score),
    [9, 9, 5]
  );
});

test('obsolete lessons are excluded by default and optional via include_statuses', () => {
  const records = [
    makeRecord({ id: 'mem_active', status: 'canonical' }),
    makeRecord({ id: 'mem_obsolete', status: 'obsolete' }),
  ];

  const index = buildMemoryIndex(records);

  const defaultResult = retrieveAdvisoryLessons({
    records,
    index,
    query: { trigger_signature: 'release_gate.no_go' },
    limit: 10,
  });

  assert.equal(defaultResult.count, 1);
  assert.deepEqual(defaultResult.hits.map(hit => hit.id), ['mem_active']);

  const withObsolete = retrieveAdvisoryLessons({
    records,
    index,
    query: {
      trigger_signature: 'release_gate.no_go',
      include_statuses: ['canonical', 'obsolete'],
    },
    limit: 10,
  });

  assert.equal(withObsolete.count, 2);
  assert.deepEqual(withObsolete.hits.map(hit => hit.id), ['mem_active', 'mem_obsolete']);
});

test('fails when query has no retrieval signal', () => {
  const records = [makeRecord({ id: 'mem_active', status: 'canonical' })];
  const index = buildMemoryIndex(records);

  assert.throws(
    () => retrieveAdvisoryLessons({ records, index, query: {}, limit: 10 }),
    /query must include at least one retrieval signal/
  );
});

test('CLI writes parseable JSON output artifact', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-retrieve-'));
  const registryPath = path.join(tempDir, 'registry.jsonl');
  const indexPath = path.join(tempDir, 'index.json');
  const queryPath = path.join(tempDir, 'query.json');
  const outPath = path.join(tempDir, 'out.json');

  const record = makeRecord({ id: 'mem_cli', status: 'canonical' });
  fs.writeFileSync(registryPath, `${JSON.stringify(record)}\n`, 'utf8');
  fs.writeFileSync(
    queryPath,
    `${JSON.stringify({ trigger_signature: 'release_gate.no_go' }, null, 2)}\n`,
    'utf8'
  );

  try {
    execFileSync(
      process.execPath,
      [
        path.resolve('scripts/plan-conformance/memory-retrieve.mjs'),
        '--registry',
        registryPath,
        '--index',
        indexPath,
        '--query',
        queryPath,
        '--out',
        outPath,
      ],
      { stdio: 'ignore' }
    );

    const parsed = JSON.parse(fs.readFileSync(outPath, 'utf8'));
    assert.equal(parsed.count, 1);
    assert.deepEqual(parsed.hits.map(hit => hit.id), ['mem_cli']);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
