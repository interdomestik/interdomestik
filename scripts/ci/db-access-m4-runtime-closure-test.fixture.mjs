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
const meta = () => ({
  inputs: Object.fromEntries(
    [contract.entryFile, ...contract.expectedInputs].map(file => [
      file,
      {
        imports: [
          ...([contract.entryFile, ...contract.qualificationTransforms.importers].includes(file)
            ? [{ path: contract.qualificationTransforms.target, external: false }]
            : []),
          ...(file === M4_RUNTIME_TLS_SOURCE_FILES.postureSource
            ? [{ path: 'node:tls', external: true, kind: 'import-statement' }]
            : []),
        ],
      },
    ])
  ),
  outputs: {
    'm4-runtime.cjs': {
      entryPoint: contract.entryFile,
      imports: contract.outputExternalSpecifiers.map(path => ({
        path,
        external: true,
        kind: 'require-call',
      })),
    },
  },
});
function owned(body) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'm4-seal-test-')));
  try {
    fs.writeFileSync(path.join(root, 'module.mjs'), 'export const fixed = 1;');
    return body(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}
const tlsSources = () =>
  Object.fromEntries(
    Object.entries(M4_RUNTIME_TLS_SOURCE_FILES).map(([role, file]) => [
      role,
      fs.readFileSync(new URL('../../' + file, import.meta.url), 'utf8'),
    ])
  );
const posture = M4_RUNTIME_TLS_SOURCE_FILES.postureSource;
function writeBoundTlsSources(root, sources = tlsSources()) {
  for (const [role, file] of Object.entries(M4_RUNTIME_TLS_SOURCE_FILES)) {
    const target = path.join(root, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, sources[role]);
  }
}
export { meta, owned, tlsSources, posture, writeBoundTlsSources };
