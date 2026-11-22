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
    /R-28 One bounded protected PR per change holds its scope, acceptance, implementation and tests and is its record: no program, tracker or ledger edits, no bookkeeping-only PR\./u
  );
  assert.match(program, /prepared, tested, merged, deployed and user-validated states separately/u);
  assert.match(agents, /prepared, tested, merged, deployed, validated by a user/u);
  assert.match(agents, /the lead \(definition, routing, merging: `RULES\.md`, R-01\)/u);
  assert.match(agents, /The owner releases\./u);
  assert.match(agents, /No agent tool reaches production, writes to staging or force-pushes\./u);
  assert.doesNotMatch(agents, /\b(?:agents?|tools?) (?:may|can) merge/iu);
  // The conditions under which the lead merges bind as written in R-01's passage "Merging by the lead" (RULES.md,
  // named by AGENTS.md R-01): the whole passage is pinned inside R-01, so moving or trimming it fails.
  const rules = read('docs/engineering/RULES.md');
  const r01 = rules.slice(rules.indexOf('### R-01 '), rules.indexOf('### R-02 '));
  assert.ok(r01.length > 0, 'RULES.md must hold R-01 before R-02');
  assert.ok(
    r01.includes(
      '- **Merging by the lead** (owner, 2026-11-21: "Bej ti merging"; it amends answer 30). The lead session may merge a PR only when all of these hold on its exact head: every required check is green; `delivery-gate` is green; the verdict of R-01 has no open finding; the tier\'s local verification is recorded (`GATE-EVIDENCE` where the tier needs it); the PR is up to date with `main`. The lead never force-pushes, never bypasses a ruleset and never merges its own unreviewed change. It records the merge in the PR: who merged, the head and the evidence. No other agent merges. Releases, deploys, ruleset repins and the authorizations of R-37 stay with the owner.\n'
    )
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
