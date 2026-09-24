import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import yaml from 'js-yaml';

const workflow = yaml.load(
  fs.readFileSync(new URL('../../.github/workflows/cd.yml', import.meta.url), 'utf8')
);
test('main pushes stage; v* tags reach production', () => {
  assert.deepEqual(workflow.on.push, { branches: ['main'], tags: ['v*'] });
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

test('dispatch defaults to staging; production needs a v* tag or an explicit target', () => {
  const target = workflow.on.workflow_dispatch.inputs.target;
  assert.deepEqual([target.default, target.options], ['staging', ['staging', 'production']]);
  const names = Object.keys(workflow.jobs).filter(
    n => workflow.jobs[n].environment?.name === 'production'
  );
  assert.equal(names.length, 4);
  const guards = names.map(name => workflow.jobs[name].if);
  assert.equal(new Set(guards).size, 1);
  const admits = (event_name, ref, input, deploy = 'true') =>
    vm.runInNewContext(guards[0].replace(/startsWith\(([^,]+), /gu, '($1).startsWith('), {
      needs: { scope: { result: 'success', outputs: { deploy } } },
      github: { event_name, ref },
      inputs: { target: input },
    });
  const branch = ['workflow_dispatch', 'refs/heads/x'];
  const tag = ['workflow_dispatch', 'refs/tags/v3.2.1'];
  assert.deepEqual(
    [
      admits('push', 'refs/heads/main'),
      admits('push', 'refs/tags/v3.2.1'),
      admits('push', 'refs/tags/nightly'),
      admits(...branch, target.default),
      admits(...branch, 'production'),
      admits(...branch, 'production', 'false'),
      admits(...tag, target.default),
      admits(...tag, 'production'),
    ],
    [false, true, false, false, true, false, false, true]
  );
});
