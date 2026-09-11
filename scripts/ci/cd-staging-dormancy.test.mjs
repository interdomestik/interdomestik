import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import yaml from 'js-yaml';

const workflow = yaml.load(
  fs.readFileSync(new URL('../../.github/workflows/cd.yml', import.meta.url), 'utf8')
);
test('dormancy excludes branch pushes with an explicit tags-only filter', () => {
  assert.deepEqual(workflow.on.push, { tags: ['v*'] });
});

test('explicit manual releases remain available without another event trigger', () => {
  assert.deepEqual(Object.keys(workflow.on).sort(), ['push', 'workflow_dispatch']);
  assert.ok(Object.hasOwn(workflow.on, 'workflow_dispatch'));
});

test('every deployment-capable job still requires successful deploy-authorizing scope', () => {
  for (const [name, job] of Object.entries(workflow.jobs)) {
    if (name === 'scope') continue;
    assert.ok([job.needs].flat().includes('scope'), name);
    assert.match(job.if, /needs\.scope\.result == 'success'/u, name);
    assert.match(job.if, /needs\.scope\.outputs\.deploy == 'true'/u, name);
  }
});
