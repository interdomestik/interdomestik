import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { M4_RUNTIME_CONTRACT as contract } from './db-access-m4-runtime-contract.mjs';
import {
  verifyM4Metafile,
  verifyM4RuntimeTlsSources,
  verifyM4RuntimeTlsSourceRoot,
  M4_RUNTIME_TLS_SOURCE_FILES,
} from './db-access-m4-runtime-closure.mjs';
import { sealM4Image, assertM4ImageUnchanged } from './db-access-m4-runtime-seal.mjs';
import {
  meta,
  owned,
  tlsSources,
  posture,
  writeBoundTlsSources,
} from './db-access-m4-runtime-closure-test.fixture.mjs';
for (const [name, change] of [
  [
    'missing posture TLS edge',
    m => {
      m.inputs[posture].imports = [];
    },
  ],
  [
    'duplicate posture TLS edge',
    m => {
      m.inputs[posture].imports.push({ ...m.inputs[posture].imports[0] });
    },
  ],
  [
    'foreign TLS importer',
    m => {
      m.inputs[contract.entryFile].imports.push({
        path: 'node:tls',
        external: true,
        kind: 'import-statement',
      });
    },
  ],
  [
    'TLS importer moved to another fixed source',
    m => {
      m.inputs[contract.entryFile].imports.push(m.inputs[posture].imports.pop());
    },
  ],
  [
    'TLS input marked internal',
    m => {
      m.inputs[posture].imports[0].external = false;
    },
  ],
  [
    'dynamic TLS input load',
    m => {
      m.inputs[posture].imports[0].kind = 'dynamic-import';
    },
  ],
  [
    'require-call TLS input load',
    m => {
      m.inputs[posture].imports[0].kind = 'require-call';
    },
  ],
  [
    'unknown TLS input kind',
    m => {
      delete m.inputs[posture].imports[0].kind;
    },
  ],
  [
    'bare TLS module alias',
    m => {
      m.inputs[posture].imports[0].path = 'tls';
    },
  ],
  [
    'duplicate output TLS import',
    m => {
      m.outputs['m4-runtime.cjs'].imports.push({
        path: 'node:tls',
        external: true,
        kind: 'require-call',
      });
    },
  ],
  [
    'dynamic output TLS import',
    m => {
      m.outputs['m4-runtime.cjs'].imports.find(row => row.path === 'node:tls').kind =
        'dynamic-import';
    },
  ],
  [
    'internal output TLS import',
    m => {
      m.outputs['m4-runtime.cjs'].imports.find(row => row.path === 'node:tls').external = false;
    },
  ],
  [
    'missing output TLS import',
    m => {
      m.outputs['m4-runtime.cjs'].imports = m.outputs['m4-runtime.cjs'].imports.filter(
        row => row.path !== 'node:tls'
      );
    },
  ],
])
  test(name + ' is refused by exact TLS graph guard', () => {
    const m = meta();
    change(m);
    assert.throws(() => verifyM4Metafile(m, contract), /M4 runtime closure refused/);
  });

test('the source-law dependency is separate from graph-only metadata and grants no runtime admission', () => {
  const result = verifyM4RuntimeTlsSources(tlsSources());
  assert.equal(result.sourcePremiseOnly, true);
  assert.equal(result.runtimeAdmission, false);
  assert.ok(Object.isFrozen(result));
  assert.match(result.bootstrapFactsSha256, /^[a-f0-9]{64}$/u);
  assert.match(result.notificationFactsSha256, /^[a-f0-9]{64}$/u);
});
for (const missing of Object.keys(M4_RUNTIME_TLS_SOURCE_FILES))
  test('missing ' + missing + ' refuses source preflight', () => {
    const sources = tlsSources();
    delete sources[missing];
    assert.throws(() => verifyM4RuntimeTlsSources(sources), /missing exact TLS source bindings/);
  });
test('an extra caller source role is not an alternate binding authority', () => {
  assert.throws(
    () => verifyM4RuntimeTlsSources({ ...tlsSources(), arbitrarySource: '' }),
    /missing exact TLS source bindings/
  );
});
for (const [name, needle, replacement] of [
  [
    'extra named TLS member',
    'checkServerIdentity, type PeerCertificate',
    'checkServerIdentity, createSecureContext, type PeerCertificate',
  ],
  [
    'namespace TLS import',
    "import { checkServerIdentity, type PeerCertificate } from 'node:tls';",
    "import * as arbitraryTls from 'node:tls';",
  ],
  [
    'dynamic literal TLS load',
    "import type postgres from 'postgres';",
    "import type postgres from 'postgres'; void import('node:tls');",
  ],
  [
    'dynamic computed TLS load',
    "import type postgres from 'postgres';",
    "import type postgres from 'postgres'; void import('node:' + 'tls');",
  ],
  [
    'computed require TLS load',
    "import type postgres from 'postgres';",
    "import type postgres from 'postgres'; const arbitraryTls = require('node:' + 'tls');",
  ],
])
  test(name + ' refuses through the approved source law even if metafile is unchanged', () => {
    const sources = tlsSources();
    assert.equal(sources.postureSource.split(needle).length, 2);
    sources.postureSource = sources.postureSource.replace(needle, replacement);
    assert.throws(
      () => verifyM4RuntimeTlsSources(sources),
      /approved captured-endpoint TLS source law/
    );
  });
test('exact TLS contract member cannot be omitted or duplicated', () => {
  for (const key of ['externalSpecifiers', 'outputExternalSpecifiers'])
    for (const duplicate of [false, true]) {
      const altered = structuredClone(contract);
      altered[key] = duplicate
        ? [...altered[key], 'node:tls']
        : altered[key].filter(value => value !== 'node:tls');
      assert.throws(() => verifyM4Metafile(meta(), altered), /M4 runtime closure refused/);
    }
});

test('actual materializer preflight helper authenticates exact source root before deriving', () =>
  owned(root => {
    writeBoundTlsSources(root);
    assert.equal(verifyM4RuntimeTlsSourceRoot(root, contract).runtimeAdmission, false);
  }));
for (const [role, file] of Object.entries(M4_RUNTIME_TLS_SOURCE_FILES))
  test('missing protected descriptor for ' + role + ' refuses preflight', () =>
    owned(root => {
      writeBoundTlsSources(root);
      const altered = structuredClone(contract);
      delete altered.files[file];
      assert.throws(
        () => verifyM4RuntimeTlsSourceRoot(root, altered),
        /missing exact TLS source binding/
      );
    })
  );
test('source swap cannot pass exact copied-source authentication', () =>
  owned(root => {
    writeBoundTlsSources(root);
    fs.writeFileSync(
      path.join(root, M4_RUNTIME_TLS_SOURCE_FILES.postureSource),
      tlsSources().notificationRuntimeSource
    );
    assert.throws(
      () => verifyM4RuntimeTlsSourceRoot(root, contract),
      /required provider runtime refused/
    );
  }));
test('rehashed extra TLS members still fail the independent source law', () =>
  owned(root => {
    const sources = tlsSources();
    sources.postureSource = sources.postureSource.replace(
      'checkServerIdentity, type PeerCertificate',
      'checkServerIdentity, createSecureContext, type PeerCertificate'
    );
    writeBoundTlsSources(root, sources);
    const changed = structuredClone(contract),
      file = M4_RUNTIME_TLS_SOURCE_FILES.postureSource;
    changed.files[file].bytes = Buffer.byteLength(sources.postureSource);
    changed.files[file].sha256 = createHash('sha256').update(sources.postureSource).digest('hex');
    assert.throws(
      () => verifyM4RuntimeTlsSourceRoot(root, changed),
      /approved captured-endpoint TLS source law/
    );
  }));
