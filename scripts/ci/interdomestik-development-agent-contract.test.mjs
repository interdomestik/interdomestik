import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import test from 'node:test';
import { structuredArtifactOwner } from '../modularity-guard-policy.mjs';

test('only the versioned Interdomestik development role receives this ownership', () => {
  assert.equal(
    structuredArtifactOwner('.codex/agents/interdomestik-developer.toml'),
    'interdomestik-development-agent-contract'
  );
  assert.equal(structuredArtifactOwner('.codex/agents/unregistered.toml'), null);
  assert.equal(structuredArtifactOwner('.codex/agents/nested/interdomestik-developer.toml'), null);
});

test('the versioned role points to a runnable preflight available in a fresh checkout', () => {
  const role = fs.readFileSync(
    new URL('../../.codex/agents/interdomestik-developer.toml', import.meta.url),
    'utf8'
  );
  const guide = fs.readFileSync(
    new URL('../../docs/guides/interdomestik-development-agent.md', import.meta.url),
    'utf8'
  );
  const preflight = 'docs/guides/interdomestik-agent-preflight.mjs';
  assert.ok(role.includes(preflight));
  assert.ok(guide.includes(`node --env-file=.env.local ${preflight}`));
  assert.ok(fs.existsSync(new URL(`../../${preflight}`, import.meta.url)));
  assert.match(role, /^name = "interdomestik-developer"$/m);
  assert.match(role, /^model = "gpt-6.1-sol"$/m);
  assert.match(role, /^model_reasoning_effort = "high"$/m);
});

test('the role and its guide defer to AGENTS.md and leave merging to the owner', () => {
  const role = fs.readFileSync(
    new URL('../../.codex/agents/interdomestik-developer.toml', import.meta.url),
    'utf8'
  );
  const guide = fs.readFileSync(
    new URL('../../docs/guides/interdomestik-development-agent.md', import.meta.url),
    'utf8'
  );
  const procedure = fs.readFileSync(
    new URL('../../docs/guides/staging-staff-member-admin-acceptance.md', import.meta.url),
    'utf8'
  );
  const flat = text => text.replace(/\s+/gu, ' ');
  const roleFlat = flat(role);
  const guideFlat = flat(guide);
  assert.ok(
    roleFlat.includes(
      'Where any passage below conflicts with AGENTS.md (program/tracker reconciliation, canonical amendments, merging or deploying), AGENTS.md wins.'
    )
  );
  assert.ok(
    roleFlat.includes(
      'Never merge, deploy or force-push: the owner merges and releases (AGENTS.md R-01, R-24).'
    )
  );
  assert.ok(
    guideFlat.includes(
      '`AGENTS.md` is the rule source and wins over any passage here or in the role definition that conflicts with it'
    )
  );
  assert.ok(
    guideFlat.includes(
      'No agent merges, deploys or force-pushes; the owner merges and releases (R-01, R-24).'
    )
  );
  // Contradicting grants or precedence must fail wherever an agent reads them.
  const AGENT_GRANT =
    /\b(?:agents?|you)\b(?:(?!\bowner\b)[^.]){0,40}?\b(?:may|can|will|should|must|is allowed to|are allowed to)\s+(?:also\s+)?(?:merge|deploy|release|force-push|write to staging|assign|submit|post)\b/iu;
  // Any agent grant to change staging data, in either word order.
  const STAGING_WRITE = [
    /\b(?:agents?|you)\b(?:(?!\bowner\b)[^.]){0,40}?\b(?:may|can|will|should|must|is allowed to|are allowed to)\s+(?:also\s+)?(?:write|update|change|create|delete|edit|modify|insert|seed|reset|post|submit)\b[^.]{0,60}\bstaging\b/iu,
    /\bstaging\b[^.]{0,60}\b(?:agents?|you)\b(?:(?!\bowner\b)[^.]){0,40}?\b(?:may|can|will|should|must|is allowed to|are allowed to)\s+(?:also\s+)?(?:write|update|change|create|delete|edit|modify|insert|seed|reset|post|submit)\b/iu,
  ];
  const MERGE_THROUGH =
    /(?<!\bowner\s(?:may\s|can\s|will\s|then\s)?)\bmerge\s(?:it\s|the PR\s)?through normal protections/iu;
  const OLD_PRECEDENCE =
    /\b(?:program|tracker|ledgers?)\b(?:(?!AGENTS\.md)[^.]){0,80}\b(?:wins|win|takes precedence|take precedence|governs?|prevails?)\b/iu;
  const procedureFlat = flat(procedure);
  for (const text of [roleFlat, guideFlat, procedureFlat]) {
    assert.doesNotMatch(text, AGENT_GRANT);
    for (const pattern of STAGING_WRITE) assert.doesNotMatch(text, pattern);
    assert.doesNotMatch(text, MERGE_THROUGH);
    assert.doesNotMatch(text, OLD_PRECEDENCE);
    assert.doesNotMatch(text, /authorized protected merge/iu);
    assert.doesNotMatch(text, /AGENTS\.md (?:yields|gives way|loses)/iu);
  }
  for (const text of [roleFlat, guideFlat]) {
    assert.ok(
      text.includes(
        'for observation only: normal UI login/logout, identity checks, reads and searches. No agent writes to staging (AGENTS.md R-24)'
      )
    );
    assert.doesNotMatch(text, /current-tracker\.md govern/u);
    assert.doesNotMatch(text, /Canonical reconciliation is an owned delivery obligation/u);
    assert.doesNotMatch(
      text,
      /move completed metrics and proof into the linked historical ledger/u
    );
    assert.doesNotMatch(text, /Paddle is the only/u);
  }
  assert.ok(
    procedureFlat.includes(
      'No agent writes to staging (`AGENTS.md`, R-24). The owner runs every write step'
    )
  );
  // The write steps (5: admin assignment, 6: staff update) never name an agent.
  const writeSteps = procedure.split('\n').filter(line => /^\|\s*(?:5|6)\s*\|/u.test(line));
  assert.equal(writeSteps.length, 2);
  for (const row of writeSteps) {
    assert.doesNotMatch(row, /\bagents?\b/iu);
  }
});

// Closed list. Every sentence (or table cell) in the role, the guide and the staging procedure that names an
// agent, Codex, Claude, a helper, a reviewer or staging together with a permission or an action verb must be one
// of the reviewed sentences below. A new or changed sentence of that kind fails until a reviewed edit of this test
// approves it, whatever its wording: merging, deploying, releasing and writing to staging stay with the owner
// (AGENTS.md R-01, R-24). Benign additions such as local test work are approved the same way.
const AUTHORITY_SOURCES = {
  role: '.codex/agents/interdomestik-developer.toml',
  guide: 'docs/guides/interdomestik-development-agent.md',
  procedure: 'docs/guides/staging-staff-member-admin-acceptance.md',
};
const UNIT_SPLIT = /(?<=[.;!?])\s+|\s\|\s/u;
const AUTHORITY_SUBJECT =
  /\b(?:agents?|you|codex|claude|helpers?|subagents?|assistants?|reviewers?|staging)\b/iu;
const AUTHORITY_ACTION =
  /\b(?:may|can|could|will|should|must|shall|allowed|permitted|merg\w*|deploy\w*|releas\w*|force-push\w*|push\w*|writ\w*|wrote|updat\w*|chang\w*|creat\w*|delet\w*|remov\w*|truncat\w*|drop\w*|wip\w*|purg\w*|clear\w*|edit\w*|modif\w*|insert\w*|seed\w*|reset\w*|post\w*|submit\w*|assign\w*|migrat\w*|alter\w*|approv\w*|appl\w*)\b/iu;
const authorityUnits = text =>
  text
    .replace(/\s+/gu, ' ')
    .split(UNIT_SPLIT)
    .map(unit => unit.trim())
    .filter(unit => AUTHORITY_SUBJECT.test(unit) && AUTHORITY_ACTION.test(unit));
const APPROVED_AUTHORITY_UNITS = {
  role: [
    'After the merge, verify the exact merge SHA read-only through staging health, canonical-host/build provenance and the required release-gate results, and report them.',
    'After the owner merges, add the exact merge SHA, the exact-SHA staging run and any remaining human acceptance to that PR.',
    'After verifying the merged work, identify one recommended next bounded slice from the ordered packages of docs/engineering/DIRECTION.md (AGENTS.md R-29), requirement gaps and mounted behavior.',
    'Assign any requested Claude coding a bounded packet with disjoint files, current source, SRS/M0-M5 constraints, acceptance and tests.',
    'Codex reviews independently, and implements only a bounded part with disjoint files that the lead assigns, which Claude then reviews (AGENTS.md, R-01).',
    'Delivery record (AGENTS.md R-28): the PR is the record of a change.',
    'Development model, agent and handoff updates use existing coding subscriptions;',
    'Do not spawn helpers unless explicitly requested by the owner or required by applicable instructions.',
    'Existing agents may retain old instructions until reloaded;',
    'Follow applicable AGENTS.md and nested instructions;',
    'For a necessary Claude file output, use a scoped in-worktree ignored artifact with the documented Edit(path) permission governing Write and correct path anchors on the served CLI;',
    'For authorized shared agent changes, compare versioned and installed hashes before editing, preserve newer lessons, and coordinate with the active owner.',
    'Give helpers source identity, acceptance, exact interfaces, allowed output and forbidden scope.',
    'If the approved Claude CLI repeatedly denies the deterministic local verification command before execution, preserve that limitation and use Codex as the explicitly attributed repo-command executor within Claude-owned delivery;',
    'If tooling changes or a helper stops for integrity, preserve that stop and continue through a separately authorized, fixed read-only route without repeating valid proof.',
    'Never merge, deploy or force-push: the owner merges and releases (AGENTS.md R-01, R-24).',
    "No agent writes to staging (AGENTS.md R-24): every step there that assigns, updates, notes or otherwise changes data is the owner's, and the agent records it as owner-run or blocked.",
    'No model approves its own work, a blocked reviewer is not an approval, and no paid API is a fallback.',
    'When Claude coding is requested, assign a concrete implementation packet before coding: disjoint files, failing acceptance example, interfaces and constraints.',
    "When the lead assigns Codex a bounded part with disjoint files in its own worktree, Codex implements that part at this role's configured effort and Claude reviews it.",
    'Where any passage below conflicts with AGENTS.md (program/tracker reconciliation, canonical amendments, merging or deploying), AGENTS.md wins.',
    "it does not message another chat or treat a helper's recommendation as owner approval.",
    'name = "interdomestik-developer" description = "Own one bounded Interdomestik increment through research, Claude collaboration, integrated verification and owner-authorized delivery." model = "gpt-6.1-sol" model_reasoning_effort = "high" sandbox_mode = "workspace-write" approval_policy = "on-request" developer_instructions = \'\'\' You are the Interdomestik development agent.',
    'no agent writes to staging (R-24).',
  ],
  guide: [
    "# Interdomestik development agent This Codex agent reviews Claude Code's work and, when the lead assigns one, takes a bounded part of an Interdomestik development task (`AGENTS.md`, R-01).",
    '## Lessons verified by the second pilot PR #1854 reached exact-merge staging P0 in 3h 24m 58s elapsed, including waits.',
    '## Mandatory canonical reconciliation Delivery record (AGENTS.md R-28): the PR is the record of a change.',
    "## Owner's delivery lifecycle A DIRECTION.md package or the owner's explicit request (R-29) → bounded selection → fresh worktree from updated main → implementation and focused green checks → authorized PR candidate (full local proof pending) → current-head review and analysis complete → consolidated corrections and focused regressions → final source/environment freeze → required full local proof and hosted checks green → owner merge → read-only Actions/staging proof on the merge SHA → completion recorded on the PR → safe worktree retirement → chat archival → next slice.",
    'After the owner merges, add the exact merge SHA, the exact-SHA staging run and any remaining human acceptance to that PR.',
    'After verifying the merged work, identify one recommended next bounded slice from the ordered packages of docs/engineering/DIRECTION.md (AGENTS.md R-29), requirement gaps and mounted behavior.',
    'Assign any requested Claude coding a bounded packet with disjoint files, current source, SRS/M0-M5 constraints, acceptance and tests.',
    'Before designing or changing UI/UX, follow the installed Interdomestik skill: research current design practices and current end-to-end journeys for members, agents, staff and admins using relevant primary sources and comparable products.',
    'Codex create_thread, set_thread_archived',
    'Codex list_artifacts, create_worktree, archive_worktree',
    'Codex reviews independently and takes a bounded part only when the lead assigns one (`AGENTS.md`, R-01 and R-02, which also set the routes).',
    'Development model, agent and handoff updates use existing coding subscriptions;',
    'Do not edit files, start services, create a PR, merge, deploy or spawn more helpers.',
    'For a necessary Claude file output, use a scoped in-worktree ignored artifact with the documented Edit(path) permission governing Write and correct path anchors on the served CLI;',
    'If Claude is asked to implement, assign a bounded file-owned coding packet before implementation and record served model, returned patch, accepted code and integrator corrections.',
    'If the approved Claude CLI repeatedly denies the deterministic local verification command before execution, preserve that limitation and use Codex as the explicitly attributed repo-command executor within Claude-owned delivery;',
    'If tooling changes or a helper stops for integrity, preserve that stop and continue through a separately authorized, fixed read-only route without repeating valid proof.',
    'Its editable definition is `.codex/agents/interdomestik-developer.toml` (revision `2026-10-03-bounded-search-packets`).',
    "Merge and deployment are the owner's (AGENTS.md R-01).",
    'No agent merges, deploys or force-pushes;',
    "No agent writes to staging (AGENTS.md R-24): every step there that assigns, updates, notes or otherwise changes data is the owner's, and the agent records it as owner-run or blocked.",
    'No model approves its own work, a blocked reviewer is not an approval, and no paid API is a fallback.',
    'Record scope and acceptance in the PR before implementation, and mark delivered completion on the merged PR only after the required post-merge proof (AGENTS.md R-28: no program, tracker or ledger edits, no bookkeeping-only PR).',
    'Simulation answers validate instruction interpretation, not execution of the actual development, Claude, CI, deployment or cleanup workflow.',
    'The agent must discover the corresponding existing test and browser route.',
    'The owner merges (AGENTS.md R-01);',
    'This is a simulation: do not edit files, invoke Claude, start services, call GitHub, merge, deploy or clean up.',
    'This uses the instructions but does not prove custom-agent discovery or apply its model settings;',
    "When the lead assigns Codex a bounded part with disjoint files in its own worktree, Codex implements that part at this role's configured effort and Claude reviews it.",
    '`AGENTS.md` is the rule source and wins over any passage here or in the role definition that conflicts with it, including passages on program/tracker reconciliation, merging and deploying.',
    '``` The parent should delegate once to the named custom agent.',
    'after the merge the agent verifies exact-SHA staging proof read-only and performs authorized cleanup.',
    "it does not message another chat or treat a helper's recommendation as owner approval.",
    'it requires no separate Agents API application.',
    'the agent must not ask repeatedly for actions already covered.',
  ],
  procedure: [
    'A staging defect does not authorize architecture refactoring, proxy edits, a live cutover or bypassing RLS.',
    'Before designing or changing UI/UX, follow the installed Interdomestik skill: research current design practices and current end-to-end journeys for members, agents, staff and admins using relevant primary sources and comparable products.',
    'No agent writes to staging (`AGENTS.md`, R-24).',
  ],
};

test('every agent authority sentence in the role, guide and staging procedure is reviewed', () => {
  for (const [key, file] of Object.entries(AUTHORITY_SOURCES)) {
    const text = fs.readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
    assert.deepEqual(
      authorityUnits(text).sort(),
      APPROVED_AUTHORITY_UNITS[key],
      `${file}: an agent authority sentence was added, changed or removed; review it and update the approved list`
    );
  }
});

// Complete-text pin. A word list cannot foresee every wording of a grant, so each authority file is pinned
// as a whole: any edit fails here until it has been reviewed for agent authority (AGENTS.md R-01, R-24) and
// the new hash is recorded in a reviewed edit of this test.
const PINNED_AUTHORITY_SHA256 = {
  role: 'cb5934ee542070ee15c57544b3f674bca9fc2f2890afd9df6ff04e46f81e5d5d',
  guide: '1755ff767aca96c634358da763badf7bf33b4ae5c9d6a4919b03b2dc8bb473bf',
  procedure: 'e1f3502eb83ee054935cda9d1df34a8680c8bba8e16e3abb46eec4c09ea053ed',
};

test('the role, guide and staging procedure are pinned to their reviewed text', () => {
  for (const [key, file] of Object.entries(AUTHORITY_SOURCES)) {
    const bytes = fs.readFileSync(new URL(`../../${file}`, import.meta.url));
    assert.equal(
      crypto.createHash('sha256').update(bytes).digest('hex'),
      PINNED_AUTHORITY_SHA256[key],
      `${file} changed: review it for agent authority, then record its new sha256 here`
    );
  }
});
