import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = file => readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
const section = (text, heading) => {
  const start = text.indexOf(`${heading}\n`);
  assert.notEqual(start, -1, `Missing delivery section: ${heading}`);
  const content = text.slice(start + heading.length + 1);
  return content.split(/\n#{1,3} /u)[0].replace(/\s+/gu, ' ');
};

const agents = read('AGENTS.md');
const program = read('docs/plans/current-program.md');
const tracker = read('docs/plans/current-tracker.md');
// AGENTS.md holds the Definition of Done (R-04) in section 3 and the size policy (R-10) in section 6; the program
// document keeps its own delivery section.
const agentsDone = section(agents, '## 3. Definition of Done (R-04)');
const agentsGates = section(agents, '## 6. Gates, environment, secrets');
const programDelivery = section(program, '## Ordinary Product Delivery');

test('ordinary entry instructions retain coarse limits without exact accounting admission', () => {
  for (const text of [agentsGates, programDelivery]) {
    assert.match(text, /repo:size:check/u);
    assert.match(text, /growth is advisory/u);
    assert.match(text, /coarse largest-file/u);
    assert.match(text, /no exact allocation/iu);
  }
  assert.match(
    agentsGates,
    /`repo:size:check` growth is advisory except the coarse largest-file and class-aware modularity limits: no exact allocation, shared-budget edit or byte-specific approval for routine source, test or catalogue work\./u
  );
  assert.match(
    agents,
    /Routine schema, locale and dependency changes pass without an admission PR/u
  );
  assert.match(agents, /Today's required checks stay until the owner approves a change/u);
  assert.match(programDelivery, /Historical allocations remain evidence/u);
  assert.match(program, /explicit legacy work/u);
});

test('ordinary delivery does not require ritual companion PRs or collapse delivery states', () => {
  assert.match(programDelivery, /one bounded protected PR/iu);
  assert.match(programDelivery, /status-only/u);
  assert.match(agents, /R-22 One bounded unit per session: implement, verify, record, stop\./u);
  assert.match(
    agents,
    /R-28 The PR is the record of a change: no edits to program, tracker or ledger documents for it, no bookkeeping-only PR\./u
  );
  assert.match(program, /prepared, tested, merged, deployed and user-validated states separately/u);
  assert.match(agents, /prepared, tested, merged, deployed, validated by a user/u);
  assert.match(agents, /The owner merges and releases/u);
  assert.match(
    agents,
    /No agent tool reaches production, writes to staging, merges or force-pushes/u
  );
  assert.match(tracker, /No deployment, product readiness or user-acceptance claim/u);
});

test('ordinary governance reduction preserves required verification and security boundaries', () => {
  for (const text of [agentsDone, programDelivery]) {
    assert.match(text, /pnpm pr:verify/u);
    assert.match(text, /pnpm security:guard/u);
  }
  assert.match(agents, /proxy\.ts[^]*change it only with owner approval/u);
  assert.match(agents, /Payments only through the provider-neutral port/u);
  assert.match(program, /Tenant\/RLS and document lifecycle\s+protections remain mandatory/u);
  assert.match(program, /Protected hosted checks remain separate\s+trust evidence/u);
});
