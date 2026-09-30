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
