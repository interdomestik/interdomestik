# Review & Evidence Console Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone, reviewer-first console that completes a repo-safe `MOB-03a` evidence packet, preserves drafts and corrections locally, and exports an auditable receipt without changing Interdomestik runtime.

**Architecture:** A dependency-free local web app lives under `tools/review-evidence-console/`. A loopback-only Node server serves static HTML, CSS, JSON, and ES modules; pure repositories, validators, stores, and receipt helpers own data behavior; small render functions own each screen. The app uses fixture assignments and local browser storage only.

**Tech Stack:** Node.js 24, HTML, CSS, ES modules, Web Crypto, `localStorage`, Node's built-in test runner, in-app Browser/Playwright MCP.

**Approved spec:** `docs/superpowers/specs/2026-07-09-review-evidence-console-design.md`

**Execution isolation:** Start implementation in a dedicated `codex/review-evidence-console` worktree from the commit that contains this approved plan and spec. Do not edit `apps/web/`, `packages/`, `apps/web/src/proxy.ts`, README, AGENTS, or architecture files.

---

## File Structure

Create only these implementation files:

```text
tools/review-evidence-console/
├── public/
│   ├── index.html                     # Semantic app shell and stylesheet/module entrypoints
│   ├── data/
│   │   ├── assignments.json           # Repo-safe local assignment fixtures
│   │   ├── reviewers.json             # Repo-safe reviewer fixture profiles
│   │   └── packets/
│   │       ├── mob-03a-part-a.json    # Four Part A item definitions
│   │       └── mob-03a-part-b.json    # Four Part B item definitions
│   ├── src/
│   │   ├── app.mjs                    # App bootstrap and view transitions
│   │   ├── router.mjs                 # Hash-route parsing and navigation
│   │   ├── data/fixture-repository.mjs# Fixture loading and cross-record validation
│   │   ├── models/normalize-fixture.mjs# Reviewer, assignment, and packet normalization
│   │   ├── models/normalize-review.mjs# Item, decision, and draft normalization
│   │   ├── validation/input-guards.mjs# Repo-reference and sensitive-input validation
│   │   ├── validation/item.mjs        # Descriptor-driven item validation
│   │   ├── validation/packet.mjs      # Ordered packet validation and error grouping
│   │   ├── state/canonical-json.mjs   # Stable recursive key ordering and serialization
│   │   ├── state/draft-store.mjs      # Draft keys, optimistic saves, conflicts, recovery
│   │   ├── state/receipt-builder.mjs  # Risk summary, SHA-256 ID, tamper-evident payload
│   │   ├── state/receipt-store.mjs    # Receipt persistence, import, hash validation, deletion
│   │   ├── state/review-session.mjs   # In-memory reviewer state and item transitions
│   │   ├── components/dom.mjs         # Safe DOM helpers using textContent only
│   │   ├── components/packet-rail.mjs # Packet progress and item navigation
│   │   ├── components/decision.mjs    # Explicit decision and evidence form controls
│   │   ├── components/status.mjs      # Autosave, scope, validation, and risk notices
│   │   ├── views/inbox.mjs            # Fixture assignment inbox
│   │   ├── views/workspace.mjs        # Three-region guided review workspace
│   │   ├── views/validation.mjs       # Grouped missing-field summary
│   │   └── views/receipt.mjs          # Receipt, export, import, and correction entry
│   └── styles/
│       ├── tokens.css                 # Interdomestik-derived colors, type, radius, spacing
│       ├── base.css                   # Reset, typography, focus, form primitives
│       ├── layout.css                 # Shell, inbox, workspace, rails, receipt layout
│       ├── components.css             # Cards, buttons, decision states, notices
│       └── responsive.css             # Tablet/mobile/reduced-motion/zoom behavior
├── server/
│   ├── app.mjs                        # Loopback static-server contract
│   └── start.mjs                      # CLI entrypoint and port validation
└── tests/
    ├── server.test.mjs
    ├── fixture-repository.test.mjs
    ├── input-guards.test.mjs
    ├── item-validation.test.mjs
    ├── packet-validation.test.mjs
    ├── draft-store.test.mjs
    ├── receipt-builder.test.mjs
    ├── receipt-store.test.mjs
    └── review-session.test.mjs
```

Keep every JavaScript and CSS file below 150 lines. If a task would cross that limit, extract the named responsibility before adding more code.

---

## Chunk 1: Data, Validation, Persistence, And Server

### Task 1: Add The Loopback-Only Static Server

**Files:**

- Create: `tools/review-evidence-console/server/app.mjs`
- Create: `tools/review-evidence-console/server/start.mjs`
- Create: `tools/review-evidence-console/public/index.html`
- Test: `tools/review-evidence-console/tests/server.test.mjs`

- [ ] **Step 1: Write six failing server-contract tests**

Create a temporary public root containing `index.html`, `app.mjs`, `app.js`, `styles.css`, `fixture.json`, `icon.png`, `icon.webp`, and `font.woff2`. Use one `startServer(t)` helper that listens on port `0`, asserts `server.address().address === '127.0.0.1'`, and closes through `t.after`.

Write exactly these tests in `server.test.mjs`:

```js
test('GET and HEAD serve the shell with every security header', async t => {
  const origin = await startServer(t);
  for (const method of ['GET', 'HEAD']) {
    const response = await fetch(`${origin}/`, { method });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
    assert.equal(response.headers.get('cross-origin-resource-policy'), 'same-origin');
    assert.equal(response.headers.get('content-security-policy'), "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; connect-src 'none'");
    if (method === 'HEAD') assert.equal(await response.text(), '');
  }
});

test('rejects non-read methods', async t => {
  const origin = await startServer(t);
  const response = await fetch(`${origin}/`, { method: 'POST' });
  assert.equal(response.status, 405);
  assert.equal(response.headers.get('allow'), 'GET, HEAD');
});

test('returns every allowlisted MIME type and rejects unsupported extensions', async t => {
  const origin = await startServer(t);
  const cases = [
    ['/index.html', 'text/html'],
    ['/app.mjs', 'text/javascript'],
    ['/app.js', 'text/javascript'],
    ['/styles.css', 'text/css'],
    ['/fixture.json', 'application/json'],
    ['/icon.png', 'image/png'],
    ['/icon.webp', 'image/webp'],
    ['/font.woff2', 'font/woff2'],
  ];
  for (const [pathname, mime] of cases) {
    const response = await fetch(origin + pathname);
    assert.match(response.headers.get('content-type'), new RegExp(mime));
  }
  const unsupported = await fetch(`${origin}/secret.txt`);
  assert.equal(unsupported.status, 415);
  assert.match(unsupported.headers.get('content-type'), /text\\/plain/);
});

test('returns 404 without reflecting the requested path', async t => {
  const origin = await startServer(t);
  const response = await fetch(`${origin}/missing.js`);
  assert.equal(response.status, 404);
  assert.doesNotMatch(await response.text(), /missing\.js/);
});

test('rejects malformed encoding and paths outside the public root', async () => {
  assert.equal(resolvePublicFile('/%E0%A4%A', publicRoot).code, 400);
  assert.equal(resolvePublicFile('/..%2F..%2Fpackage.json', publicRoot).code, 403);
  assert.equal(resolvePublicFile('/nested/../../../package.json', publicRoot).code, 403);
});

test('validates PORT and starts on loopback only', async t => {
  assert.equal(parsePort(undefined), 4177);
  assert.equal(parsePort('5123'), 5123);
  for (const value of ['0', '1023', '65536', 'abc']) assert.throws(() => parsePort(value));
  const server = await startConsoleServer({ port: 0 });
  t.after(() => server.close());
  assert.equal(server.address().address, '127.0.0.1');
});
```

- [ ] **Step 2: Run the server test and verify RED**

Run:

```bash
node --test tools/review-evidence-console/tests/server.test.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `server/app.mjs`.

- [ ] **Step 3: Implement the complete minimal server contract**

`app.mjs` must export `resolvePublicFile`, `createConsoleServer`, and the MIME/security constants. Keep path resolution separate from response writing so malformed and traversal cases remain unit-testable. Use `decodeURIComponent` once, `path.resolve(root, '.' + pathname)`, and accept the file only when it equals the root or starts with `${root}${path.sep}`.

`defaultJsonLoader` must use static imports with import attributes and an in-memory pathname map; it must not call `fetch`, XHR, or dynamic URLs. Add a counted browser test that stubs `fetch`/XHR and asserts both remain unused while fixtures load.

The loader test dynamically imports the repository after stubbing both APIs, loads all four fixture pathnames, and asserts zero calls. `tests/validation-fixtures.mjs` exports shared `baseItem` and `completeDecision` fixtures; both validation test modules import it explicitly, and ordinary packet cases pass `true` for the packet acknowledgement.

`start.mjs` must export:

```js
export function parsePort(value) {
  if (value === undefined) return 4177;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1024 || port > 65535)
    throw new Error('PORT must be an integer from 1024 to 65535.');
  return port;
}

export async function startConsoleServer({ port = parsePort(process.env.PORT) } = {}) {
  const server = createConsoleServer();
  server.listen(port, '127.0.0.1');
  await once(server, 'listening');
  return server;
}
```

The CLI branch calls `startConsoleServer`, then prints exactly one local URL. `index.html` must link these exact stylesheets: `/styles/tokens.css`, `/styles/base.css`, `/styles/layout.css`, `/styles/components.css`, `/styles/responsive.css`; it then loads `/src/app.mjs`. Do not add inline CSS or JavaScript.

- [ ] **Step 4: Run the server test and verify GREEN**

Run:

```bash
node --test tools/review-evidence-console/tests/server.test.mjs
```

Expected: `6` tests pass with `0` failures and no warnings.

- [ ] **Step 5: Commit the server foundation**

```bash
git add tools/review-evidence-console/server tools/review-evidence-console/public/index.html tools/review-evidence-console/tests/server.test.mjs
git commit -m "feat: add reviewer console server"
```

### Task 2: Add Repo-Safe Fixtures And Repository Validation

**Files:**

- Create: `tools/review-evidence-console/public/data/reviewers.json`
- Create: `tools/review-evidence-console/public/data/assignments.json`
- Create: `tools/review-evidence-console/public/data/packets/mob-03a-part-a.json`
- Create: `tools/review-evidence-console/public/data/packets/mob-03a-part-b.json`
- Create: `tools/review-evidence-console/public/src/models/normalize-fixture.mjs`
- Create: `tools/review-evidence-console/public/src/models/normalize-review.mjs`
- Create: `tools/review-evidence-console/public/src/data/fixture-repository.mjs`
- Test: `tools/review-evidence-console/tests/fixture-repository.test.mjs`
- Test: `tools/review-evidence-console/tests/default-json-loader.test.mjs`
- Test: `tools/review-evidence-console/tests/validation-fixtures.mjs`

- [ ] **Step 1: Write eight failing repository, normalization, and loader tests**

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { createFixtureRepository } from '../public/src/data/fixture-repository.mjs';
import {
  normalizeAssignment,
  normalizePacket,
  normalizeReviewer,
} from '../public/src/models/normalize-fixture.mjs';

const reviewer = {
  id: 'reviewer_privacy_mk',
  displayName: 'Privacy reviewer',
  role: 'privacy',
  repoSafe: true,
};
const assignments = [
  {
    id: 'assign_mob03a_part_a',
    packetId: 'mob-03a-part-a',
    reviewerFixtureId: reviewer.id,
    reviewerRole: 'privacy',
    status: 'in_progress',
    dueDate: '2026-07-15',
    risk: 'high',
    fixture: true,
  },
  {
    id: 'assign_mob03a_part_b',
    packetId: 'mob-03a-part-b',
    reviewerFixtureId: reviewer.id,
    reviewerRole: 'privacy',
    status: 'not_started',
    dueDate: '2026-07-16',
    risk: 'medium',
    fixture: true,
  },
];
const item = {
  id: 'M03A-PRIVACY-OWNER',
  prompt: 'Who owns the decision?',
  need: 'Named ownership is required.',
  repoImpact: 'Keeps review accountability local.',
  guidance: 'Use the fixture role only.',
  baseFields: [
    'decision',
    'concreteAnswer',
    'reason',
    'evidenceRef',
    'verifiedAt',
    'riskCategory',
    'severity',
    'requestedChange',
  ],
  allowedRiskCategories: ['privacy', 'legal'],
  requiredResponses: [
    { key: 'ownerRole', type: 'text', required: true, maxLength: 80, options: [] },
  ],
};
const partA = {
  id: 'mob-03a-part-a',
  version: '1',
  reviewerRole: 'privacy',
  title: 'Mobile authority evidence — privacy',
  scope: 'Fixture-only mobile privacy authority review.',
  stopConditions: ['Missing authority reference', 'Sensitive evidence supplied'],
  itemIds: [
    'M03A-PRIVACY-OWNER',
    'M03A-MEDICAL-BOUNDARY',
    'M03A-CONSENT-FIELDS',
    'M03A-ACCESS-ROLES',
  ],
  items: [
    item,
    { ...item, id: 'M03A-MEDICAL-BOUNDARY' },
    { ...item, id: 'M03A-CONSENT-FIELDS' },
    { ...item, id: 'M03A-ACCESS-ROLES' },
  ],
};
const partB = {
  ...partA,
  id: 'mob-03a-part-b',
  items: partA.items.map((entry, index) => ({ ...entry, id: `M03A-PART-B-${index + 1}` })),
};
partB.itemIds = partB.items.map(entry => entry.id);
const fixtureMap = new Map([
  ['/data/reviewers.json', [reviewer]],
  ['/data/assignments.json', assignments],
  ['/data/packets/mob-03a-part-a.json', partA],
  ['/data/packets/mob-03a-part-b.json', partB],
]);
const fakeLoader = async path => structuredClone(fixtureMap.get(path));
const mismatchedLoader = async path =>
  path.endsWith('mob-03a-part-a.json') ? { ...partA, reviewerRole: 'legal' } : fakeLoader(path);

test('returns only assignments for the selected fixture reviewer', async () => {
  const repository = createFixtureRepository({ loadJson: fakeLoader });
  const result = await repository.listAssignments('reviewer_privacy_mk');
  assert.equal(result.ok, true);
  assert.deepEqual(
    result.value.map(row => row.id),
    ['assign_mob03a_part_a', 'assign_mob03a_part_b']
  );
});

test('rejects a packet role that disagrees with the assignment reviewer', async () => {
  const repository = createFixtureRepository({ loadJson: mismatchedLoader });
  const result = await repository.loadAssignmentBundle('assign_mob03a_part_a');
  assert.deepEqual(result, {
    ok: false,
    code: 'invalid_data',
    message: 'Assignment, reviewer, and packet roles do not match.',
  });
});
```

```js
test('normalizes reviewer, assignment, and packet records', () => {
  assert.deepEqual(normalizeReviewer(reviewer), reviewer);
  assert.deepEqual(normalizeAssignment(assignments[0]), assignments[0]);
  assert.deepEqual(normalizePacket(partA).itemIds, partA.itemIds);
});

test('preserves exact ordered item IDs and descriptor keys', () => {
  for (const packet of [partA, partB]) {
    assert.deepEqual(
      packet.items.map(entry => entry.id),
      packet.itemIds
    );
    assert.ok(
      packet.items.every(
        entry =>
          entry.prompt &&
          entry.need &&
          entry.repoImpact &&
          entry.guidance &&
          entry.baseFields.length
      )
    );
  }
});

test('loads one reviewer profile', async () => {
  const result = await createFixtureRepository({ loadJson: fakeLoader }).loadReviewerProfile(
    reviewer.id
  );
  assert.deepEqual(result, { ok: true, value: reviewer });
});

test('loads each four-item packet independently', async () => {
  const repository = createFixtureRepository({ loadJson: fakeLoader });
  assert.equal((await repository.loadPacket(partA.id)).value.items.length, 4);
  assert.equal((await repository.loadPacket(partB.id)).value.items.length, 4);
});

test('returns one validated assignment bundle', async () => {
  const result = await createFixtureRepository({ loadJson: fakeLoader }).loadAssignmentBundle(
    assignments[0].id
  );
  assert.equal(result.ok, true);
  assert.equal(result.value.assignment.id, assignments[0].id);
  assert.equal(result.value.reviewer.id, reviewer.id);
  assert.equal(result.value.packet.id, partA.id);
});

test('returns stable errors for missing and malformed fixtures', async () => {
  const missing = await createFixtureRepository({ loadJson: fakeLoader }).loadPacket('missing');
  assert.deepEqual(missing, {
    ok: false,
    code: 'not_found',
    message: 'Packet fixture was not found.',
  });
  assert.throws(() => normalizePacket({ ...partA, items: [{ id: 'bad' }] }), /requiredResponses/);
});
```

- [ ] **Step 2: Run repository tests and verify RED**

Run:

```bash
node --test tools/review-evidence-console/tests/fixture-repository.test.mjs
```

Expected: FAIL because the repository module does not exist.

- [ ] **Step 3: Create the fixtures**

Create `assign_mob03a_part_a` in progress and `assign_mob03a_part_b` not started for `reviewer_privacy_mk`. Part A references `mob-03a-part-a`; Part B references `mob-03a-part-b`. Mark every assignment `fixture: true` and every profile `repoSafe: true`. Use roles, not account IDs.

Define four structured items per packet file. Each `requiredResponses` descriptor must include `key`, `labelSq`, `type`, `required`, `maxLength`, `options`, and `requiredWhen` when conditional. Keep medical/injury excluded in fixture content. Keep each packet JSON below 200 lines.

- [ ] **Step 4: Implement normalization and repository results**

`normalize-fixture.mjs` exposes reviewer, assignment, and packet normalizers. `normalize-review.mjs` exposes item, decision, and draft normalizers. `fixture-repository.mjs` must expose:

```js
export function createFixtureRepository({ loadJson = defaultJsonLoader } = {}) {
  return {
    listAssignments,
    loadPacket,
    loadReviewerProfile,
    loadAssignmentBundle,
  };
}
```

Every method returns `{ ok: true, value }` or `{ ok: false, code, message }`. Cross-check assignment packet ID, reviewer fixture ID, and reviewer role before returning a bundle.

- [ ] **Step 5: Run repository tests and verify GREEN**

Run:

```bash
node --test tools/review-evidence-console/tests/fixture-repository.test.mjs
```

Expected: `9` tests pass with `0` failures.

- [ ] **Step 6: Commit the fixture repository**

```bash
git add tools/review-evidence-console/public/data tools/review-evidence-console/public/src/models tools/review-evidence-console/public/src/data tools/review-evidence-console/tests/fixture-repository.test.mjs
git commit -m "feat: add reviewer packet fixtures"
```

### Task 3: Implement Input Guards And Descriptor Validation

**Files:**

- Create: `tools/review-evidence-console/public/src/validation/input-guards.mjs`
- Create: `tools/review-evidence-console/public/src/validation/item.mjs`
- Create: `tools/review-evidence-console/public/src/validation/packet.mjs`
- Test: `tools/review-evidence-console/tests/input-guards.test.mjs`
- Test: `tools/review-evidence-console/tests/item-validation.test.mjs`
- Test: `tools/review-evidence-console/tests/packet-validation.test.mjs`

- [ ] **Step 1: Write failing input-guard tests**

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { validateEvidenceRef, validateSafeText } from '../public/src/validation/input-guards.mjs';

test('accepts allowed repo references', () => {
  assert.equal(validateEvidenceRef('docs/product/packet.md#L21').ok, true);
  assert.equal(validateEvidenceRef('output/review/packet.json').ok, true);
});

for (const value of [
  'https://private.example/evidence',
  'docs/../secret',
  'docs//bad.md',
  'docs/file.md?raw=1',
]) {
  test(`rejects invalid reference: ${value}`, () => {
    assert.equal(validateEvidenceRef(value).code, 'invalid_reference');
  });
}

for (const value of [
  'reviewer@example.com',
  'https://private.example',
  'Bearer abc123',
  '4111111111111111',
]) {
  test(`rejects sensitive text: ${value}`, () => {
    assert.equal(validateSafeText(value).code, 'sensitive_input');
  });
}

test('rejects control characters', () =>
  assert.equal(validateSafeText('bad\u0000value').code, 'sensitive_input'));
test('rejects values over the supplied limit', () =>
  assert.equal(validateSafeText('abcd', { maxLength: 3 }).code, 'too_long'));
test('accepts short repo-safe prose', () =>
  assert.equal(validateSafeText('Medical data stays disabled.').ok, true));
```

- [ ] **Step 2: Write failing descriptor and conditional-field tests**

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { validateItem } from '../public/src/validation/item.mjs';

const baseItem = { id: 'item', requiredResponses: [] };
const medicalItem = {
  id: 'medical',
  requiredResponses: [
    { key: 'medicalBoundary', type: 'option', required: true, options: ['allowed', 'excluded'] },
    {
      key: 'dpiaRef',
      type: 'evidenceRef',
      requiredWhen: { key: 'medicalBoundary', equals: 'allowed' },
    },
    {
      key: 'disabledScope',
      type: 'text',
      maxLength: 240,
      requiredWhen: { key: 'medicalBoundary', equals: 'excluded' },
    },
  ],
};
const completeDecision = overrides => ({
  decision: 'approve',
  concreteAnswer: 'Approved for the fixture boundary.',
  reason: 'The source authority supports this decision.',
  evidenceRef: 'docs/product/packet.md#L21',
  verifiedAt: '2026-07-09',
  riskCategory: 'privacy',
  severity: 'high',
  requestedChange: '',
  responses: {},
  ...overrides,
});

test('requires a DPIA reference only when medical data is allowed', () => {
  const allowed = validateItem(
    medicalItem,
    completeDecision({
      responses: { medicalBoundary: 'allowed', dpiaRef: '' },
    })
  );
  assert.deepEqual(
    allowed.errors.map(error => error.key),
    ['dpiaRef']
  );

  const excluded = validateItem(
    medicalItem,
    completeDecision({
      responses: { medicalBoundary: 'excluded', disabledScope: 'Medical data stays disabled.' },
    })
  );
  assert.equal(excluded.valid, true);
});

test('requires requested change for change and block decisions', () => {
  const result = validateItem(
    baseItem,
    completeDecision({ decision: 'block', requestedChange: '' })
  );
  assert.equal(
    result.errors.some(error => error.key === 'requestedChange'),
    true
  );
});

test('accepts a complete base decision', () => {
  assert.deepEqual(validateItem(baseItem, completeDecision({})), { valid: true, errors: [] });
});

test('rejects option values outside the descriptor', () => {
  const result = validateItem(
    medicalItem,
    completeDecision({ responses: { medicalBoundary: 'unknown' } })
  );
  assert.equal(
    result.errors.some(error => error.key === 'medicalBoundary'),
    true
  );
});

test('validates packet-level repo-safe evidence acknowledgement', () => {
  const result = validatePacket({ items: [baseItem] }, { item: completeDecision({}) }, false);
  assert.equal(
    result.errors.some(error => error.key === 'safeEvidenceConfirmed'),
    true
  );
});
```

In `packet-validation.test.mjs`, use the same concrete item and decision shapes:

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { validatePacket } from '../public/src/validation/packet.mjs';

test('returns item validation in packet order', () => {
  const result = validatePacket(
    {
      items: [
        { id: 'first', requiredResponses: [] },
        { id: 'second', requiredResponses: [] },
      ],
    },
    {}
  );
  assert.deepEqual(
    result.items.map(entry => entry.itemId),
    ['first', 'second']
  );
});

test('groups the exact missing-field count', () => {
  const result = validatePacket({ items: [{ id: 'only', requiredResponses: [] }] }, { only: {} });
  assert.equal(result.valid, false);
  assert.equal(result.errorCount, 7);
});

test('rejects invalid dates and guarded nested fields', () => {
  const invalidDate = validateItem(baseItem, completeDecision({ verifiedAt: 'not-a-date' }));
  const unsafeReason = validateItem(
    baseItem,
    completeDecision({ reason: 'contact me at reviewer@example.com' })
  );
  assert.equal(
    invalidDate.errors.some(error => error.key === 'verifiedAt'),
    true
  );
  assert.equal(
    unsafeReason.errors.some(error => error.key === 'reason'),
    true
  );
});
```

- [ ] **Step 3: Run both validation files and verify RED**

Run:

```bash
node --test tools/review-evidence-console/tests/input-guards.test.mjs tools/review-evidence-console/tests/item-validation.test.mjs tools/review-evidence-console/tests/packet-validation.test.mjs
```

Expected: FAIL because validation modules do not exist.

- [ ] **Step 4: Implement exact guard patterns**

Implement the exact evidence-reference, email, URL scheme, credential, numeric sequence, control-character, and length rules from the spec. Return stable field errors:

```js
{ ok: false, code: 'sensitive_input', message: 'Use repo-safe operational text only.' }
```

Do not sanitize and silently accept forbidden input.

- [ ] **Step 5: Implement descriptor-driven validation**

`item-validation.test.mjs` imports only `validateItem` and shared fixtures from `tests/validation-fixtures.mjs`. `packet-validation.test.mjs` imports both validators and passes `true` for ordinary packet cases and `false` only for the acknowledgement failure. `item.mjs` exports `validateItem(item, decision)` for seven item-level fields, `requiredResponses`, `requiredWhen`, option membership, dates, free-text guards, and evidence references. `packet.mjs` exports `validatePacket(packet, decisions, safeEvidenceConfirmed)` and owns the single packet-level safety acknowledgement. Neither file may exceed 150 lines.

- [ ] **Step 6: Run validation tests and verify GREEN**

Run:

```bash
node --test tools/review-evidence-console/tests/input-guards.test.mjs tools/review-evidence-console/tests/item-validation.test.mjs tools/review-evidence-console/tests/packet-validation.test.mjs
```

Expected: `20` tests pass with `0` failures.

- [ ] **Step 7: Commit validation**

```bash
git add tools/review-evidence-console/public/src/validation tools/review-evidence-console/tests/input-guards.test.mjs tools/review-evidence-console/tests/item-validation.test.mjs tools/review-evidence-console/tests/packet-validation.test.mjs
git commit -m "feat: validate reviewer evidence"
```

### Task 4: Implement Draft And Receipt Persistence

**Files:**

- Create: `tools/review-evidence-console/public/src/state/canonical-json.mjs`
- Create: `tools/review-evidence-console/public/src/state/draft-store.mjs`
- Create: `tools/review-evidence-console/public/src/state/receipt-builder.mjs`
- Create: `tools/review-evidence-console/public/src/state/receipt-store.mjs`
- Test: `tools/review-evidence-console/tests/draft-store.test.mjs`
- Test: `tools/review-evidence-console/tests/receipt-builder.test.mjs`
- Test: `tools/review-evidence-console/tests/receipt-store.test.mjs`

- [ ] **Step 1: Write failing draft key and conflict tests**

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { composeDraftKey, createDraftStore } from '../public/src/state/draft-store.mjs';

const makeStorage = () => {
  const values = new Map();
  return {
    get length() {
      return values.size;
    },
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
  };
};
const storage = makeStorage();
const store = createDraftStore({ storage, schemaVersion: 1 });
const key = 'review-console:v1:draft:assign_a:reviewer_a:2';
const draft = {
  schemaVersion: 1,
  assignmentId: 'assign_a',
  packetId: 'mob-03a-part-a',
  reviewerFixtureId: 'reviewer_a',
  packetVersion: '2',
  itemDecisions: { item_a: { decision: 'approve' } },
  activeItem: 'item_a',
  updatedAt: '2026-07-09T12:00:00.000Z',
  editorId: 'tab_a',
};

test('separates drafts by assignment, reviewer, and packet version', () => {
  assert.equal(
    composeDraftKey({
      assignmentId: 'assign_a',
      reviewerFixtureId: 'reviewer_a',
      packetVersion: '2',
    }),
    'review-console:v1:draft:assign_a:reviewer_a:2'
  );
  assert.throws(() =>
    composeDraftKey({ assignmentId: '../bad', reviewerFixtureId: 'r', packetVersion: '1' })
  );
});

test('returns conflict when a newer tab already saved', () => {
  storage.setItem(
    key,
    JSON.stringify({ updatedAt: '2026-07-09T12:01:00.000Z', editorId: 'other' })
  );
  const result = store.save(key, draft, '2026-07-09T12:00:00.000Z');
  assert.equal(result.code, 'conflict');
});

test('saves and loads a compatible draft', () => {
  assert.equal(store.save(key, draft, null).ok, true);
  assert.deepEqual(store.load(key), { ok: true, value: draft });
});

test('rejects a structurally incomplete draft', () => {
  assert.equal(store.save(key, { ...draft, packetId: undefined }, null).code, 'invalid_data');
});

test('removes only the requested draft', () => {
  storage.setItem('other', '{}');
  assert.equal(store.remove(key).ok, true);
  assert.equal(storage.getItem('other'), '{}');
});

test('exports incompatible data without deleting it', () => {
  storage.setItem(key, JSON.stringify({ ...draft, schemaVersion: 2 }));
  assert.equal(store.load(key).code, 'schema_mismatch');
  assert.match(store.exportRecovery(key).value, /"schemaVersion":2/);
  assert.notEqual(storage.getItem(key), null);
});

test('preserves corrupt JSON for recovery or deletion', () => {
  storage.setItem(key, '{bad');
  assert.equal(store.load(key).code, 'invalid_data');
  assert.equal(store.exportRecovery(key).value, '{bad');
});

test('maps quota failures to a stable error', () => {
  const quotaStorage = makeStorage();
  quotaStorage.setItem = () => {
    throw new DOMException('full', 'QuotaExceededError');
  };
  assert.equal(
    createDraftStore({ storage: quotaStorage, schemaVersion: 1 }).save(key, draft, null).code,
    'quota'
  );
});
```

- [ ] **Step 2: Write failing receipt determinism and correction tests**

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalStringify } from '../public/src/state/canonical-json.mjs';
import { aggregateRisk, buildReceipt } from '../public/src/state/receipt-builder.mjs';

const receiptInput = {
  schemaVersion: 1,
  packetId: 'mob-03a-part-a',
  assignmentId: 'assign_a',
  reviewerFixtureId: 'reviewer_a',
  decisions: { item_a: { decision: 'approve', severity: 'high', riskCategory: 'privacy' } },
  authorityDisclaimer: 'Fixture authority only; no production decision.',
  reviewerRole: 'privacy',
  packetRole: 'privacy',
  structuredResponses: { item_a: { ownerRole: 'Privacy lead' } },
};
const reorderedReceiptInput = {
  decisions: receiptInput.decisions,
  structuredResponses: receiptInput.structuredResponses,
  authorityDisclaimer: receiptInput.authorityDisclaimer,
  packetRole: receiptInput.packetRole,
  reviewerRole: receiptInput.reviewerRole,
  reviewerFixtureId: 'reviewer_a',
  assignmentId: 'assign_a',
  packetId: 'mob-03a-part-a',
  schemaVersion: 1,
};

test('builds the same receipt ID for the same canonical payload', async () => {
  const submittedAt = '2026-07-09T12:00:00.000Z';
  const one = await buildReceipt({ ...receiptInput, submittedAt });
  const two = await buildReceipt({ ...reorderedReceiptInput, submittedAt });
  assert.equal(one.receiptId, two.receiptId);
  assert.match(one.receiptId, /^rec_[a-f0-9]{24}$/);
});

test('links correction versions without mutating the first receipt', async () => {
  const firstReceipt = await buildReceipt({
    ...receiptInput,
    submittedAt: '2026-07-09T12:00:00.000Z',
  });
  const correction = await buildReceipt({
    ...receiptInput,
    previousReceipt: firstReceipt,
    correctionItemId: 'item_a',
    correctionReason: 'Clarify evidence boundary.',
    correctionImpact: 'Improves auditability.',
  });
  assert.equal(correction.receiptVersion, 2);
  assert.equal(correction.previousReceiptId, firstReceipt.receiptId);
  assert.equal(firstReceipt.receiptVersion, 1);
});

test('sorts object keys recursively and preserves array order', () => {
  assert.equal(
    canonicalStringify({ z: 1, a: { y: 2, b: [3, 1] } }),
    '{"a":{"b":[3,1],"y":2},"z":1}'
  );
});

test('aggregates the highest severity and sorted unique risk categories', () => {
  assert.deepEqual(
    aggregateRisk([
      { severity: 'high', riskCategory: 'privacy' },
      { severity: 'high', riskCategory: 'legal' },
      { severity: 'low', riskCategory: 'privacy' },
    ]),
    { severity: 'high', categories: ['legal', 'privacy'] }
  );
});

test('requires correction item, reason, and impact for version two', async () => {
  const firstReceipt = await buildReceipt({
    ...receiptInput,
    submittedAt: '2026-07-09T12:00:00.000Z',
  });
  await assert.rejects(() => buildReceipt({ ...receiptInput, previousReceipt: firstReceipt }));
});
```

- [ ] **Step 3: Write six failing receipt-store tests**

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { createReceiptStore } from '../public/src/state/receipt-store.mjs';

const makeStorage = () => {
  const values = new Map();
  return {
    get length() {
      return values.size;
    },
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
  };
};
const validReceipt = {
  schemaVersion: 1,
  receiptId: 'rec_aaaaaaaaaaaaaaaaaaaaaaaa',
  packetId: 'mob-03a-part-a',
  assignmentId: 'assign_a',
  reviewerFixtureId: 'reviewer_a',
  receiptVersion: 1,
  packetVersion: '1',
  reviewerDisplayName: 'Privacy reviewer',
  submittedAt: '2026-07-09T12:00:00.000Z',
  riskSummary: { severity: 'high', categories: ['privacy'] },
  reviewerRole: 'privacy',
  packetRole: 'privacy',
  authorityDisclaimer: 'Fixture authority only; no production decision.',
  decisions: { item_a: { decision: 'approve', severity: 'high', riskCategory: 'privacy' } },
  structuredResponses: { item_a: { ownerRole: 'Privacy lead' } },
};
const metadata = {
  packetId: validReceipt.packetId,
  assignmentId: validReceipt.assignmentId,
  reviewerFixtureId: validReceipt.reviewerFixtureId,
  reviewerRole: 'privacy',
  packetRole: 'privacy',
};
const okVerify = async receipt => ({ ok: true, value: receipt });

test('saves, lists, and loads one write-once receipt', () => {
  const store = createReceiptStore({
    storage: makeStorage(),
    verifyReceipt: okVerify,
    schemaVersion: 1,
  });
  assert.equal(store.save(validReceipt).ok, true);
  assert.deepEqual(store.list(validReceipt.packetId).value, [validReceipt]);
  assert.deepEqual(store.load(validReceipt.receiptId).value, validReceipt);
});

test('imports valid canonical JSON', async () => {
  const store = createReceiptStore({
    storage: makeStorage(),
    verifyReceipt: okVerify,
    schemaVersion: 1,
  });
  assert.deepEqual(await store.import(JSON.stringify(validReceipt), metadata), {
    ok: true,
    value: validReceipt,
  });
});

test('rejects malformed and field-invalid imports without storage mutation', async () => {
  const storage = makeStorage();
  const store = createReceiptStore({ storage, verifyReceipt: okVerify, schemaVersion: 1 });
  assert.equal((await store.import('{bad', metadata)).code, 'invalid_data');
  assert.equal(
    (await store.import(JSON.stringify({ ...validReceipt, assignmentId: 'wrong' }), metadata)).code,
    'invalid_data'
  );
  assert.equal(storage.length, 0);
});

test('removes a stored receipt explicitly', () => {
  const store = createReceiptStore({
    storage: makeStorage(),
    verifyReceipt: okVerify,
    schemaVersion: 1,
  });
  store.save(validReceipt);
  assert.equal(store.remove(validReceipt.receiptId).ok, true);
  assert.equal(store.load(validReceipt.receiptId).code, 'not_found');
});

for (const [name, verifyResult] of [
  ['hash mismatch', { ok: false, code: 'hash_mismatch', message: 'Receipt hash does not match.' }],
  [
    'schema mismatch',
    { ok: false, code: 'schema_mismatch', message: 'Receipt schema is incompatible.' },
  ],
]) {
  test(`rejects imported ${name}`, async () => {
    const storage = makeStorage();
    const store = createReceiptStore({
      storage,
      verifyReceipt: async () => verifyResult,
      schemaVersion: 1,
    });
    assert.deepEqual(await store.import(JSON.stringify(validReceipt), metadata), verifyResult);
    assert.equal(storage.length, 0);
  });
}

test('rejects packet, reviewer, or assignment metadata mismatch', async () => {
  const storage = makeStorage();
  const store = createReceiptStore({ storage, verifyReceipt: okVerify, schemaVersion: 1 });
  assert.equal(
    (await store.import(JSON.stringify(validReceipt), { ...metadata, assignmentId: 'other' })).code,
    'invalid_data'
  );
  assert.equal(storage.length, 0);
});

test('is idempotent for the same body and rejects the same id with another body', () => {
  const store = createReceiptStore({
    storage: makeStorage(),
    verifyReceipt: okVerify,
    schemaVersion: 1,
  });
  assert.equal(store.save(validReceipt).ok, true);
  assert.equal(store.save(validReceipt).ok, true);
  assert.equal(store.save({ ...validReceipt, receiptVersion: 2 }).code, 'hash_mismatch');
});
```

- [ ] **Step 4: Run state tests and verify RED**

Run:

```bash
node --test tools/review-evidence-console/tests/draft-store.test.mjs tools/review-evidence-console/tests/receipt-builder.test.mjs tools/review-evidence-console/tests/receipt-store.test.mjs
```

Expected: FAIL because state modules do not exist.

- [ ] **Step 5: Implement canonical JSON and receipt building**

Recursively sort object keys, preserve array order, use the injected `submittedAt` or call an injected `now()` once, aggregate the highest severity, hash canonical UTF-8 bytes through `crypto.subtle`, and prefix the first 24 hex characters with `rec_`. Deep-freeze the returned receipt object and verify its canonical hash on load, export, and import; add a nested-mutation corruption test.

- [ ] **Step 6: Implement injected storage adapters**

Both stores accept `{ storage = globalThis.localStorage }`. Catch browser exceptions and return stable results. Draft recovery exports the untouched draft, not a receipt. Receipt import accepts JSON text only; file reading remains a view concern.

- [ ] **Step 7: Run state tests and verify GREEN**

Run:

```bash
node --test tools/review-evidence-console/tests/draft-store.test.mjs tools/review-evidence-console/tests/receipt-builder.test.mjs tools/review-evidence-console/tests/receipt-store.test.mjs
```

Expected: `21` tests pass with `0` failures.

- [ ] **Step 8: Commit persistence**

```bash
git add tools/review-evidence-console/public/src/state tools/review-evidence-console/tests/draft-store.test.mjs tools/review-evidence-console/tests/receipt-builder.test.mjs tools/review-evidence-console/tests/receipt-store.test.mjs
git commit -m "feat: persist reviewer drafts and receipts"
```

### Chunk 1 Integration Checkpoint

- [ ] **Run every Chunk 1 test together**

```bash
node --test tools/review-evidence-console/tests/server.test.mjs tools/review-evidence-console/tests/fixture-repository.test.mjs tools/review-evidence-console/tests/input-guards.test.mjs tools/review-evidence-console/tests/item-validation.test.mjs tools/review-evidence-console/tests/packet-validation.test.mjs tools/review-evidence-console/tests/draft-store.test.mjs tools/review-evidence-console/tests/receipt-builder.test.mjs tools/review-evidence-console/tests/receipt-store.test.mjs
```

Expected: `56` tests pass with `0` failures.

- [ ] **Enforce modularity limits**

```bash
rg --files tools/review-evidence-console | rg '\.(mjs|css)$' | xargs wc -l | awk '$2 != "total" && $1 > 150 { print; bad=1 } END { exit bad }'
rg --files tools/review-evidence-console/public/data/packets | xargs wc -l | awk '$2 != "total" && $1 > 200 { print; bad=1 } END { exit bad }'
```

Expected: both commands exit `0` and print no violating file.

---

## Chunk 2: Reviewer Workflow And Responsive UI

### Task 5: Add Review Session State And Hash Routing

**Files:**

- Create: `tools/review-evidence-console/public/src/router.mjs`
- Create: `tools/review-evidence-console/public/src/state/review-session.mjs`
- Test: `tools/review-evidence-console/tests/review-session.test.mjs`

- [ ] **Step 1: Write failing route and session tests (12 tests)**

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { parseRoute } from '../public/src/router.mjs';
import { createReviewSession } from '../public/src/state/review-session.mjs';
import { bundle } from './validation-fixtures.mjs';

test('parses inbox, packet, validation, and receipt routes', () => {
  assert.deepEqual(parseRoute('#/'), { name: 'inbox' });
  assert.deepEqual(parseRoute('#/review/assign_a/item_a'), {
    name: 'workspace',
    assignmentId: 'assign_a',
    itemId: 'item_a',
  });
  assert.deepEqual(parseRoute('#/review/assign_a/validate'), {
    name: 'validation',
    assignmentId: 'assign_a',
  });
  assert.deepEqual(parseRoute('#/receipt/rec_abc'), { name: 'receipt', receiptId: 'rec_abc' });
});

test('never treats system guidance as a human decision', () => {
  const session = createReviewSession(bundle);
  session.useGuidance('M03A-PRIVACY-OWNER');
  assert.equal(session.getDecision('M03A-PRIVACY-OWNER').decision, null);
  assert.notEqual(session.getDecision('M03A-PRIVACY-OWNER').concreteAnswer, '');
});
```

- [ ] **Step 2: Run the session test and verify RED**

Run:

```bash
node --test tools/review-evidence-console/tests/review-session.test.mjs
```

Expected: FAIL because router and session modules do not exist.

- [ ] **Step 3: Implement route parsing and session transitions**

Expose pure `parseRoute(hash)` and `formatRoute(route)` helpers. `createReviewSession(bundle, draft)` must expose `getSnapshot`, `selectItem`, `setDecision`, `setField`, `setResponse`, `useGuidance`, `validate`, and `createCorrection`. State changes return new frozen snapshots and call an injected `onChange` callback.

- [ ] **Step 4: Run the session test and verify GREEN**

Run:

```bash
node --test tools/review-evidence-console/tests/review-session.test.mjs
```

Expected: `12` tests pass with `0` failures.

- [ ] **Step 5: Commit routing and session state**

```bash
git add tools/review-evidence-console/public/src/router.mjs tools/review-evidence-console/public/src/state/review-session.mjs tools/review-evidence-console/tests/review-session.test.mjs
git commit -m "feat: add reviewer session flow"
```

### Task 6: Build The App Shell And Assignment Inbox

**Files:**

- Create: `tools/review-evidence-console/public/src/app.mjs`
- Create: `tools/review-evidence-console/public/src/components/dom.mjs`
- Create: `tools/review-evidence-console/public/src/components/status.mjs`
- Create: `tools/review-evidence-console/public/src/views/inbox.mjs`
- Create: `tools/review-evidence-console/public/styles/tokens.css`
- Create: `tools/review-evidence-console/public/styles/base.css`
- Create: `tools/review-evidence-console/public/styles/layout.css`
- Create: `tools/review-evidence-console/public/styles/components.css`
- Create: `tools/review-evidence-console/public/styles/responsive.css`
- Test: `tools/review-evidence-console/tests/dom-and-inbox.test.mjs`

- [ ] **Step 1: Implement safe DOM helpers**

RED tests assert that `innerHTML` is rejected, user content is written through `textContent`, attributes are allowlisted, and loading, empty, unavailable, and populated inbox states render correctly.

Provide `element(tag, options)`, `text(value)`, `replaceChildren(target, children)`, and `announce(message)`. `element` may set allowlisted attributes and event listeners; it must place copy through `textContent` and reject an `innerHTML` option.

- [ ] **Step 2: Add Interdomestik-derived tokens and base styles**

Use the approved deep blue, teal, cool surfaces, 12px radius, Space Grotesk/Inter/system fallbacks, visible focus, 44px touch targets, and non-color status labels. Keep each stylesheet below 150 lines.

- [ ] **Step 3: Render the local-proof app header**

The header must show `Review & Evidence Console`, `Local review fixture`, reviewer role, autosave live region, and a local-data menu. It must not imply production authentication.

- [ ] **Step 4: Render the reviewer-first inbox**

Use cards, not a table. Each card shows canonical packet ID, Albanian title, purpose, risk label, progress, and `Open packet` or `Resume packet`. Include empty, loading, and unavailable states.

- [ ] **Step 5: Start the server and verify the inbox manually**

Run:

```bash
node tools/review-evidence-console/server/start.mjs
```

Expected: prints one `http://127.0.0.1:<port>` URL. Open it with the in-app browser. Confirm one Part A card and one Part B card render, navigation controls have visible focus, and browser logs contain no errors or warnings.

- [ ] **Step 6: Commit the shell and inbox**

Keep bootstrapping in `app.mjs`; extract controller, inbox, and view rendering into separate modules before any file exceeds 150 lines.

```bash
git add tools/review-evidence-console/public/index.html tools/review-evidence-console/public/src/app.mjs tools/review-evidence-console/public/src/components tools/review-evidence-console/public/src/views/inbox.mjs tools/review-evidence-console/public/styles
git commit -m "feat: add reviewer assignment inbox"
```

### Task 7: Build The Guided Review Workspace

**Files:**

- Create: `tools/review-evidence-console/public/src/components/packet-rail.mjs`
- Create: `tools/review-evidence-console/public/src/components/decision.mjs`
- Create: `tools/review-evidence-console/public/src/views/workspace.mjs`
- Modify: `tools/review-evidence-console/public/src/app.mjs`
- Modify: `tools/review-evidence-console/public/styles/layout.css`
- Modify: `tools/review-evidence-console/public/styles/components.css`

- [ ] **Step 1: Render packet scope and progress**

The packet rail must show ordered items, `Not started`, `In review`, `Needs change`, `Blocked`, or `Complete` text, and the non-medical scope guard. Clicking an item updates the hash route and moves focus to the item heading.

- [ ] **Step 2: Render the current prompt and guidance**

Show canonical item ID, Albanian prompt, need, repo impact, and the separated system-guidance panel. `Use as a starting point` copies guidance into answer/reason fields only.

- [ ] **Step 3: Render explicit decision controls**

Use a native radio group for `Mirato`, `Kërkon ndryshim`, and `Blloko`. Start with no selected option. Render base fields and descriptor-specific controls from `requiredResponses`; do not hard-code MOB-03a form rows in the view.

- [ ] **Step 4: Render the evidence rail and autosave states**

Keep evidence reference, verification date, risk category, severity, and repo-safe acknowledgement beside the decision on desktop. Debounce draft saves, announce saving/saved/failure states, and stop autosave on a tab conflict.

The acknowledgement is one packet-level control, persisted once in the draft and passed once to `validatePacket`. Add focused tests for corrupt/schema-mismatched recovery export, explicit draft deletion, quota errors, and `storage` event conflict detection.

- [ ] **Step 5: Verify one item flow in the browser**

With Browser/Playwright MCP:

1. Open Part A.
2. Select `Consent fields`.
3. Confirm no decision is selected.
4. Use guidance and confirm the decision remains unset.
5. Choose `Approve`, fill the evidence reference, and save.
6. Reload and confirm the draft returns to the same item.

Expected: all values persist, focus remains logical, and no console error or warning appears.

- [ ] **Step 6: Commit the workspace**

```bash
git add tools/review-evidence-console/public/src/components tools/review-evidence-console/public/src/views/workspace.mjs tools/review-evidence-console/public/src/app.mjs tools/review-evidence-console/public/styles
git commit -m "feat: add guided evidence review"
```

### Task 8: Add Validation, Receipts, Import, And Corrections

**Files:**

- Create: `tools/review-evidence-console/public/src/views/validation.mjs`
- Create: `tools/review-evidence-console/public/src/views/receipt.mjs`
- Modify: `tools/review-evidence-console/public/src/app.mjs`
- Modify: `tools/review-evidence-console/public/src/components/status.mjs`
- Modify: `tools/review-evidence-console/public/styles/components.css`

- [ ] **Step 1: Render grouped packet validation**

Show every incomplete item with its missing fields. Selecting an error navigates to the item and focuses the first invalid control. Validation failure preserves the draft.

- [ ] **Step 2: Submit and persist a receipt**

Disable duplicate submit actions while `buildReceipt` runs. Save through `ReceiptStore` before rendering the receipt. Show receipt ID, version, reviewer display name and fixture role, timestamp, risk summary, decisions, evidence references, and the authority disclaimer.

- [ ] **Step 3: Add JSON export and copy fallback**

Export canonical receipt JSON as `<receiptId>.json`. If browser download creation fails, display a read-only textarea and `Copy receipt JSON` action with a live-region result.

- [ ] **Step 4: Add local receipt import**

Use `<input type="file" accept="application/json,.json">`, explicitly reject non-`.json` filenames and files over 1 MiB before `File.text()`, and pass JSON text plus expected packet, assignment, reviewer, and role metadata to `ReceiptStore.import`. The UI must state `Read on this device; never uploaded`.

- [ ] **Step 5: Add correction entry**

From a stored or imported receipt, choose one item, enter correction reason and impact, then create a new review session. Submission must increment `receiptVersion` and preserve `previousReceiptId`.

- [ ] **Step 6: Verify receipt reload and correction flow**

With Browser/Playwright MCP:

1. Complete all four Part A items.
2. Submit and record the receipt ID.
3. Reload and reopen the receipt.
4. Export, clear only receipts, and import the JSON again.
5. Start a correction for `Access roles`.
6. Submit the correction and confirm version `2` plus the original receipt link.

Expected: application-level write-once, tamper-evident version history, no network request for import, and no browser errors or warnings.

- [ ] **Step 7: Commit validation and receipts**

```bash
git add tools/review-evidence-console/public/src/views tools/review-evidence-console/public/src/app.mjs tools/review-evidence-console/public/src/components/status.mjs tools/review-evidence-console/public/styles/components.css
git commit -m "feat: complete reviewer evidence workflow"
```

---

## Chunk 3: Responsive, Accessibility, And Repository Verification

### Task 9: Finish Responsive And Accessibility Behavior

**Files:**

- Create: `tools/review-evidence-console/public/styles/responsive.css`
- Modify: `tools/review-evidence-console/public/index.html`
- Modify: `tools/review-evidence-console/public/src/app.mjs`
- Modify: `tools/review-evidence-console/public/src/views/workspace.mjs`
- Modify: `tools/review-evidence-console/public/src/views/validation.mjs`
- Modify: `tools/review-evidence-console/public/src/views/receipt.mjs`

- [ ] **Step 1: Add tablet and mobile layout rules**

At tablet width, move evidence into a side sheet. At mobile width, stack the packet stepper above the decision, use a sticky `Save & continue` bar, preserve 44px targets, and remove all horizontal page overflow.

- [ ] **Step 2: Add reduced-motion and zoom rules**

Disable transitions under `prefers-reduced-motion: reduce`. Use fluid sizing and wrapping so 320px width and 200% browser zoom remain usable.

- [ ] **Step 3: Add focus management and live regions**

Move focus to the view heading after route changes, to the first invalid control after validation navigation, and to the receipt heading after submission. Announce autosave, import, export, validation, and local-data deletion results.

- [ ] **Step 4: Run keyboard and responsive browser proof**

Use the in-app Browser and its viewport control at `1440x1000`, `1024x768`, `390x844`, and `320x720`, then repeat the 320px workflow at 200% zoom and WCAG text spacing. Verify measured 44px targets, no horizontal overflow, semantic landmarks/headings/labels, keyboard order, focus entry/return, live-region announcements, reduced motion, and automated WCAG 2.2 AA results.

- all actions are reachable in a logical Tab order;
- focus is visible;
- status remains understandable without color;
- no content clips or scrolls horizontally;
- the sticky action bar does not cover fields;
- reduced-motion mode removes nonessential transitions;
- browser logs contain no errors or warnings.

- [ ] **Step 5: Commit responsive and accessibility behavior**

```bash
git add tools/review-evidence-console/public/styles/responsive.css tools/review-evidence-console/public/index.html tools/review-evidence-console/public/src
git commit -m "feat: polish reviewer console accessibility"
```

### Task 10: Run Focused And Mandatory Verification

**Files:**

- Modify only if a verification failure identifies a defect under `tools/review-evidence-console/`.

- [ ] **Step 1: Run all focused Node tests**

Run:

```bash
node --test tools/review-evidence-console/tests/*.test.mjs
```

Expected: all tests pass with `0` failures.

- [ ] **Step 2: Run syntax, formatting, and diff checks**

Run:

```bash
node --check tools/review-evidence-console/server/app.mjs
node --check tools/review-evidence-console/server/start.mjs
git diff --check
pnpm format:check
```

Expected: every command exits `0`.

- [ ] **Step 3: Run repository static checks**

Run:

```bash
pnpm lint
pnpm type-check
```

Expected: both commands exit `0`.

- [ ] **Step 4: Run mandatory repository gates**

Run:

```bash
pnpm pr:verify
pnpm security:guard
pnpm e2e:gate
```

Expected: every command exits `0`. Record the exact failing command and environment blocker if a gate cannot complete; do not claim a pass from focused checks.

- [ ] **Step 5: Run the final browser acceptance flow**

Start the local server and use the in-app Browser/Playwright MCP to execute inbox → review → validation → receipt → reload → import → correction at every required viewport. Use `/tmp/interdomestik-reviewer-audit/` as the identified protected-reference screenshots and write implementation captures to `/tmp/interdomestik-rec01-visual-proof/`. Compare paired screenshots at matching viewports and states, then fix visible hierarchy, spacing, radius, typography, overflow, focus, and responsive mismatches.

- [ ] **Step 6: Audit scope**

Run:

```bash
git status --short
git diff --name-only origin/main...HEAD
```

Expected: implementation files remain under `tools/review-evidence-console/`; other authorized tracked paths are the approved spec and plan, `docs/plans/2026-07-10-rec-dg01-review-evidence-console-current-authority.md`, REC rows in `docs/plans/current-program.md` and `docs/plans/current-tracker.md`, and a measured `scripts/repo-size-budget.json` update. `.superpowers/` remains ignored local brainstorming evidence, not slice scope.

- [ ] **Step 7: Commit verification fixes, if any**

```bash
git add tools/review-evidence-console
git commit -m "fix: close reviewer console verification gaps"
```

Skip this commit when verification required no code changes.
