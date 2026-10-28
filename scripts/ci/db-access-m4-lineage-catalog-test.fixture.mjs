import { strictIds, strictFiles } from './db-access-m4-lineage-catalog-strict-test.fixture.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import test from 'node:test';
import ts from 'typescript';
import { M4_LINEAGE_CATALOG as catalog } from './db-access-m4-lineage-catalog.mjs';
import { resolveLineageData } from './db-access-m4-lineage-selection.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
const hash = value => createHash('sha256').update(value).digest('hex');
const prefix = 'scripts/ci/db-access-m4-lineage-catalog';
const dataFiles = [
  prefix + '.json',
  prefix + '-frontier.json',
  prefix + '-sites-1.json',
  prefix + '-sites-2.json',
  prefix + '-sites-3.json',
];
const retainedIds = [
  'legacy-admin-pre-and-post-read/retained/0',
  'legacy-agent-domain-effects/retained/0',
  'staff-domain-effects/retained/0',
  'two-returned-mock-factories/retained/0',
];
const qualificationIds = [0, 1, 2].map(i => 'qualification-assignment-source/observation/' + i);
const tlsIds = [
  'notification-and-email/replacement/2',
  'new-private-bootstrap-and-protocol/replacement/0',
  'captured-endpoint-tls/source-observation/0',
];
const tlsFiles = [
  'apps/web/src/server/operations/m4-private-runtime.ts',
  'apps/web/src/server/operations/m4-notification-runtime.ts',
  'apps/web/src/server/operations/m4-pool-posture.ts',
];
const affectedIds = new Set([...retainedIds, ...qualificationIds, ...tlsIds, ...strictIds]);
const restoredSourceFiles = [
  'apps/web/src/actions/admin-claims.core.ts',
  'apps/web/src/actions/admin-claims/assign.core.ts',
  'apps/web/src/actions/admin-claims/assign.wrapper.test.ts',
  'apps/web/src/actions/agent-claims.core.ts',
  'apps/web/src/actions/agent-claims.test.ts',
  'apps/web/src/actions/agent-claims.wrapper.test.ts',
  'apps/web/src/actions/agent-claims/assign.core.ts',
  'apps/web/src/actions/staff-claims.core.ts',
  'apps/web/src/actions/staff-claims/assign.core.audit.test.ts',
  'apps/web/src/actions/staff-claims/assign.core.ts',
];
const qualificationFiles = [
  'apps/web/src/server/operations/m4-qualification-admin-assignment.ts',
  'apps/web/src/server/operations/m4-qualification-admin-assignment.test.ts',
  'apps/web/src/server/operations/m4-qualification-agent-assignment.ts',
  'apps/web/src/server/operations/m4-qualification-agent-assignment.test.ts',
  'apps/web/src/server/operations/m4-qualification-staff-assignment.ts',
  'apps/web/src/server/operations/m4-qualification-staff-assignment.test.ts',
];
const oldRelayRow = {
  id: 'mounted-assignment-current/residual/0',
  family: 'mounted-assignment-current',
  side: 'replacement',
  file: 'apps/web/src/actions/admin-claims/assign.core.ts',
  sourceSha256: 'c5de262008c4036007572fb6fd10c4e5ac3b4ac6aef5a7234b553eb179da92ea',
  calls: [
    {
      kind: 'CallExpression',
      startUtf16: 297,
      endUtf16: 332,
      nodeSha256: '507baa5f779c51ecb182004ddd813bfb58a759fdac4dc4839fe32bcaa54053bd',
      kindCode: 214,
    },
    {
      kind: 'CallExpression',
      startUtf16: 510,
      endUtf16: 544,
      nodeSha256: '3a3cd31d9b8e9b40c982ba3a2d3f1cac0c7e6b9f7de9178af01e323433e490e3',
      kindCode: 214,
    },
    {
      kind: 'CallExpression',
      startUtf16: 598,
      endUtf16: 646,
      nodeSha256: '23719652dfd7c2f3d0977a63fdb51676ff7aff03a689fa51f23d0c802c34cbdd',
      kindCode: 214,
    },
    {
      kind: 'CallExpression',
      startUtf16: 709,
      endUtf16: 754,
      nodeSha256: '96be42f1c86e93049509a41ebcdbd8a4aa373aa9991756c52475ee623f89bc6a',
      kindCode: 214,
    },
    {
      kind: 'CallExpression',
      startUtf16: 760,
      endUtf16: 823,
      nodeSha256: 'c45d2ba1f554051147cfc2af7efd240e3196bd9a4ee5b3d13b3572c666747d55',
      kindCode: 214,
    },
    {
      kind: 'CallExpression',
      startUtf16: 829,
      endUtf16: 873,
      nodeSha256: '9dddec16a8c59a382763580647cff626f1c0e105dcd5839d78235dccec0e7ead',
      kindCode: 214,
    },
    {
      kind: 'CallExpression',
      startUtf16: 879,
      endUtf16: 941,
      nodeSha256: '2a72eed5606441200806d9ec144840821654795c1ebabf79cf1410b7a17ea135',
      kindCode: 214,
    },
    {
      kind: 'CallExpression',
      startUtf16: 947,
      endUtf16: 991,
      nodeSha256: '4b9117dd56feee3c3e4c2e00907af194da34f29010925ea8ed5d6cd359423999',
      kindCode: 214,
    },
    {
      kind: 'CallExpression',
      startUtf16: 997,
      endUtf16: 1059,
      nodeSha256: '0be5080d41ed2f03054a028b8cbadea36dfec5c295974380987817813c52857b',
      kindCode: 214,
    },
  ],
  owners: [
    {
      kind: 'FunctionDeclaration',
      startUtf16: 212,
      endUtf16: 335,
      nodeSha256: '6bb64501ce6830e1b9403fce79a238d28620cd4226422275426c0f9c005669ee',
      kindCode: 263,
    },
    {
      kind: 'FunctionDeclaration',
      startUtf16: 336,
      endUtf16: 1092,
      nodeSha256: '631e310f0a0bfdc0e62631b639e5ad490730b654f4955d79bbbf9d1c6623fb97',
      kindCode: 263,
    },
  ],
  historicalIdentitiesReferenceOnly: [],
  unobservedAnchorResidual: true,
};

function sourceModel() {
  const sources = new Map(),
    parsed = new Map(),
    files = new WeakMap();
  for (const file of Object.keys(catalog.frontier)) {
    const text = fs.readFileSync(path.join(root, file), 'utf8');
    sources.set(file, text);
    if (!file.endsWith('.json'))
      parsed.set(file, ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true));
  }
  return {
    sources,
    parsed,
    fileOf: node => files.get(node),
    walk(sf, visit) {
      function walk(node) {
        files.set(node, sf.fileName);
        visit(node);
        ts.forEachChild(node, walk);
      }
      walk(sf);
    },
  };
}

// Test-only authenticated-storage fixture. The actual reader and exact() implementation are copied;
// policy descriptors are refreshed deliberately, so finite-class refusals cannot borrow stale pins.
async function withStorageMutation(mutate, verify) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'm4-catalog-storage-'));
  try {
    fs.mkdirSync(path.join(base, 'scripts/ci'), { recursive: true });
    fs.symlinkSync(path.join(root, 'node_modules'), path.join(base, 'node_modules'));
    const values = dataFiles.map(file =>
      JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'))
    );
    mutate(values);
    const [index, frontier, first, second, third] = values;
    const reconstructed = {
      version: index.version,
      kind: index.kind,
      basisCommit: index.basisCommit,
      frontier: frontier.frontier,
      sites: [...first.sites, ...second.sites, ...third.sites],
      runtimeAdmission: index.runtimeAdmission,
      productionCCredit: index.productionCCredit,
      historicalIdentitySelection: index.historicalIdentitySelection,
      parserVersion: index.parserVersion,
      sourceClass: index.sourceClass,
      historicalCatalogReference: index.historicalCatalogReference,
    };
    index.reconstructedSha256 = hash(JSON.stringify(reconstructed));
    for (let i = 1; i < values.length; i++) {
      const bytes = Buffer.from(JSON.stringify(values[i], null, 2) + '\n');
      Object.assign(index.shards[i - 1], {
        sha256: hash(bytes),
        bytes: bytes.length,
      });
    }
    const producerFiles = {};
    for (let i = 0; i < values.length; i++) {
      const bytes = Buffer.from(JSON.stringify(values[i], null, 2) + '\n');
      fs.writeFileSync(path.join(base, dataFiles[i]), bytes);
      producerFiles[dataFiles[i]] = {
        sha256: hash(bytes),
        bytes: bytes.length,
        mode: '100644',
      };
    }
    for (const name of [
      'db-access-m4-lineage-catalog.mjs',
      'db-access-provider-runtime-identity.mjs',
      'db-access-git-blob-batch.mjs',
    ])
      fs.copyFileSync(path.join(root, 'scripts/ci', name), path.join(base, 'scripts/ci', name));
    fs.writeFileSync(
      path.join(base, 'scripts/ci/db-access-provider-unit-policy.mjs'),
      'export const PROVIDER_UNIT_POLICY = ' + JSON.stringify({ producerFiles }) + ';\n'
    );
    await verify(
      () =>
        import(
          pathToFileURL(path.join(base, 'scripts/ci/db-access-m4-lineage-catalog.mjs')).href +
            '?test=' +
            randomUUID()
        )
    );
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
}

export {
  root,
  hash,
  prefix,
  dataFiles,
  retainedIds,
  qualificationIds,
  tlsIds,
  tlsFiles,
  strictIds,
  strictFiles,
  affectedIds,
  restoredSourceFiles,
  qualificationFiles,
  oldRelayRow,
  sourceModel,
  withStorageMutation,
};
