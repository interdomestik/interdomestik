import assert from 'node:assert/strict';
import test from 'node:test';
import { structuredArtifactOwner } from './modularity-guard-policy.mjs';

test('authorized trial role definitions have exact structured ownership without a blanket agent exception', () => {
  for (const role of ['slice-director', 'workflow-coach'])
    assert.equal(
      structuredArtifactOwner(`.codex/agents/interdomestik-${role}.toml`),
      'interdomestik-three-agent-trial-contract'
    );
  for (const file of [
    '.codex/agents/unrelated.toml',
    '.codex/agents/interdomestik-slice-director-extra.toml',
    '.codex/other/interdomestik-workflow-coach.toml',
  ])
    assert.equal(structuredArtifactOwner(file), null);
});
