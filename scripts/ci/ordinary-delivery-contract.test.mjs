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
const rules = read('docs/engineering/RULES.md');
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
  assert.match(agents, /\(`RULES\.md`, R-01: procedure, merging by the lead\)/u);
  assert.match(agents, /The owner releases\./u);
  assert.match(agents, /No agent tool reaches production, writes to staging or force-pushes\./u);
  assert.doesNotMatch(agents, /\b(?:agents?|tools?) (?:may|can) merge/iu);
  // The conditions under which the lead merges bind as written in R-01's passage "Merging by the lead" (RULES.md,
  // named by AGENTS.md R-01): the whole passage is pinned inside R-01, so moving or trimming it fails.
  const r01Start = rules.indexOf('### R-01 ');
  assert.notEqual(r01Start, -1, 'RULES.md must hold R-01');
  // R-01 ends at the next Markdown heading of the same or a higher level: an ATX heading of one to three
  // hashes with up to three leading spaces, or any setext underline (which also ends it early, failing closed).
  const r01Lines = rules.slice(r01Start).split('\n');
  const isBoundary = index =>
    /^ {0,3}#{1,3}(?:[ \t]|$)/u.test(r01Lines[index]) ||
    /^ {0,3}(?:=+|-+)[ \t]*$/u.test(r01Lines[index]);
  let r01EndLine = 1;
  while (r01EndLine < r01Lines.length && !isBoundary(r01EndLine)) r01EndLine += 1;
  const r01 = r01Lines.slice(0, r01EndLine).join('\n');
  assert.ok(
    r01.includes(
      '- **Merging by the lead** (owner, 2026-11-21: "Bej ti merging" ["You do the merging"]; procedure updated 2026-11-28). The lead may merge only when the PR is up to date with `main` and its exact head has every required check green, including `delivery-gate`, the required YES verdicts with no open finding, and the tier\'s recorded local verification under R-04. The PR records who merged, the head, each reviewer and model actually served, the tier and the evidence. The owner may merge. No other agent merges. No agent bypasses a ruleset or force-pushes. Releases, deploys, repins and writes to staging or production stay with the owner (R-24). Boundary authorization follows R-37.\n'
    )
  );
  assert.match(tracker, /No deployment, product readiness or user-acceptance claim/u);
});

test('Astra approves the exact local head before push', () => {
  assert.match(agents, /^- R-01 .*Run M5 to `PREPUSH-OK`, get R-02 YES, push\./mu);
  assert.match(agents, /^- R-02 .*reviews the exact local head once pre-push, then deltas\./mu);
  assert.match(
    section(rules, '### R-01 — Who implements, who reviews'),
    / 4\. Obtain one Astra YES on the exact local head before any push, subject to R-02's skips\. Later changes get an Astra delta review under R-02\. 5\. Push\b/u
  );
});

test('Debate retains its three triggers, owner escalation and owner-only operations', () => {
  const agentsDebate = agents.match(/^- Debate\. .+$/mu)?.[0];
  const rulesDebate = section(rules, '### R-02 — When Astra is used').match(
    /- \*\*Debate\*\* .*?(?= - \*\*|$)/u
  )?.[0];
  const contracts = [
    {
      file: 'AGENTS.md',
      passage: agentsDebate,
      clauses: [
        'only for Astra/lead disagreement on a HIGH PR',
        'a HIGH design with real alternatives',
        'two consecutive NOs on one point',
        'Unresolved boundary disputes go to the owner',
        'R-24/R-25 owner operations excluded',
      ],
    },
    {
      file: 'RULES.md',
      passage: rulesDebate,
      clauses: [
        'only for disagreement between Astra and the Claude lead on a HIGH PR',
        'a HIGH design with real alternatives',
        'two consecutive NOs on the same point',
        "Send an unresolved boundary disagreement to the owner with both positions and the lead's recommendation",
        'Repins, staging and production writes, secrets, imports and invitations remain owner operations under R-24 and R-25 and are excluded from Debate approval',
      ],
    },
  ];
  for (const { file, passage, clauses } of contracts) {
    assert.ok(passage, `Missing Debate passage in ${file}`);
    const assertClauses = text => {
      for (const clause of clauses) {
        assert.ok(text.includes(clause), `${file} Debate must retain: ${clause}`);
      }
    };

    assertClauses(passage);
    for (const clause of clauses) {
      const mutant = passage.replace(clause, '');
      assert.throws(() => assertClauses(mutant), {
        message: `${file} Debate must retain: ${clause}`,
      });
    }
  }
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
