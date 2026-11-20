import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, renameSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import yaml from 'js-yaml';
import { withManifest } from './release-evidence-fixture.mjs';

// The tracked manifest entry is what the public sees: a symbolic link stores its target path,
// and an anchor or alias is source text, so neither may stand in for the plain canonical file.
const MANIFEST = 'docs/release/production-evidence.yaml';

test('a manifest reached through a symbolic link is refused', () => {
  withManifest(
    () => ({}),
    ({ check, evidenceRoot }) => {
      const dir = path.dirname(evidenceRoot);
      renameSync(path.join(dir, MANIFEST), path.join(dir, 'signed-by-test-person.yaml'));
      symlinkSync(path.join(dir, 'signed-by-test-person.yaml'), path.join(dir, MANIFEST));
      const result = check(['--manifest-only']);
      assert.equal(result.status, 2);
      assert.match(result.stderr, /manifest path must not be a symbolic link/);
      assert.doesNotMatch(result.stdout, /PASS/);
    }
  );
});

test('a manifest in a symbolically linked directory is refused', () => {
  withManifest(
    () => ({}),
    ({ check, evidenceRoot }) => {
      const dir = path.dirname(evidenceRoot);
      mkdirSync(path.join(dir, 'test-person'));
      renameSync(path.join(dir, 'docs/release'), path.join(dir, 'test-person/release'));
      symlinkSync(path.join(dir, 'test-person/release'), path.join(dir, 'docs/release'));
      const result = check(['--manifest-only']);
      assert.equal(result.status, 2);
      assert.match(result.stderr, /manifest path must not be a symbolic link/);
    }
  );
});

test('a shared mapping written as an anchor and alias is not canonical', () => {
  withManifest(
    () => ({}),
    ({ check, evidenceRoot }) => {
      const file = path.join(path.dirname(evidenceRoot), MANIFEST);
      const text = readFileSync(file, 'utf8');
      const header = text.slice(0, text.indexOf('gates:'));
      const data = yaml.load(text, { schema: yaml.CORE_SCHEMA });
      const [artifact] = data.gates[0].required_artifacts;
      data.gates[0].required_artifacts = [artifact, artifact];
      const shared = yaml.dump(data, { schema: yaml.CORE_SCHEMA, lineWidth: -1 });
      assert.match(shared, /&ref_0[\s\S]*\*ref_0/u);
      writeFileSync(file, header + shared);
      const result = check(['--evidence-root', evidenceRoot]);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /manifest: must be in canonical form/);
    }
  );
});
