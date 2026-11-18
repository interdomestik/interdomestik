import assert from 'node:assert/strict';
import test from 'node:test';
import { ARTIFACT_SHA, gateLines, withManifest } from './release-evidence-fixture.mjs';

// The checker refuses every manifest shape that the published schema refuses, so a name cannot
// ride along in a field, a merged mapping or an unexpected value type while the check passes.
function failsWith(cases, expected, options = {}) {
  withManifest(
    id => cases[id] ?? {},
    ({ check }) => {
      const result = check(['--manifest-only']);
      assert.equal(result.status, 1, result.stdout);
      assert.doesNotMatch(result.stdout, /PASS/);
      for (const pattern of expected) assert.match(result.stderr, pattern);
    },
    options
  );
}

const tail = 'signer_ref: T503-SIGNER, role: owner';

test('signoff and artifacts accept only the schema fields, even when a field is empty', () => {
  failsWith(
    {
      G01: { signoff: `{ ${tail}, signed_at: 2026-07-02, attestation: { name: Test Person } }` },
      G02: {
        artifact: ['file: G02-evidence.pdf', `sha256: ${ARTIFACT_SHA}`, 'metadata: { name: x }'],
      },
      G03: { signoff: `{ ${tail}, signed_at: 2026-07-02, name: null }` },
      G04: { signoff: `{ ${tail}, signed_at: 2026-07-02, email: ~ }` },
      G05: { artifact: ['file: G05-evidence.pdf', `sha256: ${ARTIFACT_SHA}`, 'path: null'] },
    },
    [
      /G01: signoff\.attestation is not accepted/,
      /G02: artifact metadata is not accepted/,
      /G03: signoff\.name must not be recorded here/,
      /G04: signoff\.email must not be recorded here/,
      /G05: artifact path is not accepted/,
    ]
  );
});

test('the signoff date is a real calendar date written YYYY-MM-DD', () => {
  const cases = {
    G01: { signoff: `{ ${tail}, signed_at: { name: Test Person } }` },
    G02: { signoff: `{ ${tail}, signed_at: [2026-07-02] }` },
    G03: { signoff: `{ ${tail}, signed_at: false }` },
    G04: { signoff: `{ ${tail}, signed_at: 2026-02-30 }` },
    G05: { signoff: `{ ${tail}, signed_at: '2026-02-30' }` },
    G06: { signoff: `{ ${tail}, signed_at: 2026-07-03T25:00:00Z }` },
    G07: { signoff: `{ ${tail}, signed_at: 2026-07-03T10:00:00Z }` },
    G08: { signoff: `{ ${tail}, signed_at: '2026-07-02' }` },
    G09: { signoff: `{ ${tail}, signed_at: 2024-02-29 }` },
  };
  withManifest(
    id => cases[id] ?? {},
    ({ check }) => {
      const result = check(['--manifest-only']);
      assert.equal(result.status, 1);
      for (const id of ['G01', 'G02', 'G03', 'G04', 'G05', 'G06', 'G07']) {
        assert.match(result.stderr, new RegExp(`${id}: signoff\\.signed_at must be a date`));
      }
      assert.doesNotMatch(result.stderr, /G08:|G09:/);
    }
  );
});

test('gate and manifest keys are closed and the owner is text', () => {
  failsWith(
    {
      G01: { owner: '{ name: Test Person }' },
      G02: { extra: ['signer_name: Test Person'] },
    },
    [
      /G01: owner must be text/,
      /G02: signer_name is not accepted/,
      /manifest: signer_name is not accepted/,
    ],
    { header: ['signer_name: Test Person'] }
  );
});

test('YAML merge keys are refused instead of resolved', () => {
  failsWith(
    {
      G03: {
        signoff: `{ <<: { signer_ref: { name: Test Person } }, ${tail}, signed_at: 2026-07-02 }`,
      },
      G04: { extra: ['<<: { notes: Test Person }'] },
    },
    [/G03: signoff\.<< is not accepted/, /G04: << is not accepted/]
  );
});

test('description, status and id take only the schema values', () => {
  failsWith(
    {
      G01: { description: '[first, second]' },
      G02: { status: 'SUPPLIED' },
      G03: { status: '[supplied]' },
    },
    [
      /G01: description must be text/,
      /G02: status=SUPPLIED is not one of/,
      /G03: status=supplied is not one of/,
      /<unknown>: id must be one of G01-G10/,
      /G01: listed more than once/,
    ],
    { extraGates: [gateLines('G11'), gateLines('G01')] }
  );
});
