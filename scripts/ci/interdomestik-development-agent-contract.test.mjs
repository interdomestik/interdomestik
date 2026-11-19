import assert from 'node:assert/strict';
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
  const MERGE_THROUGH =
    /(?<!\bowner\s(?:may\s|can\s|will\s|then\s)?)\bmerge\s(?:it\s|the PR\s)?through normal protections/iu;
  const OLD_PRECEDENCE =
    /\b(?:program|tracker|ledgers?)\b(?:(?!AGENTS\.md)[^.]){0,80}\b(?:wins|win|takes precedence|take precedence|governs?|prevails?)\b/iu;
  const procedureFlat = flat(procedure);
  for (const text of [roleFlat, guideFlat, procedureFlat]) {
    assert.doesNotMatch(text, AGENT_GRANT);
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
