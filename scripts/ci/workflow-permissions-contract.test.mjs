import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import yaml from 'js-yaml';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const workflowDir = path.join(rootDir, '.github', 'workflows');
const permissionValues = new Set(['read', 'write', 'none']);

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function readWorkflow(relativePath) {
  return yaml.load(fs.readFileSync(path.join(rootDir, relativePath), 'utf8'));
}

function workflowPaths() {
  return fs
    .readdirSync(workflowDir)
    .filter(fileName => fileName.endsWith('.yml') || fileName.endsWith('.yaml'))
    .sort()
    .map(fileName => `.github/workflows/${fileName}`);
}

function assertPermissionMap(location, permissions) {
  assert.equal(typeof permissions, 'object', `${location} permissions must be a map`);
  assert.notEqual(permissions, null, `${location} permissions must be explicit`);

  for (const [scope, access] of Object.entries(permissions)) {
    assert.ok(permissionValues.has(access), `${location} ${scope} permission must be read/write/none`);
  }
}

test('GitHub workflows define explicit GITHUB_TOKEN permissions', () => {
  const missing = [];

  for (const relativePath of workflowPaths()) {
    const workflow = readWorkflow(relativePath);
    const workflowHasPermissions = hasOwn(workflow, 'permissions');

    if (workflowHasPermissions) {
      assertPermissionMap(`${relativePath} workflow`, workflow.permissions);
    }

    for (const [jobName, job] of Object.entries(workflow.jobs ?? {})) {
      const jobHasPermissions = hasOwn(job, 'permissions');

      if (jobHasPermissions) {
        assertPermissionMap(`${relativePath} job ${jobName}`, job.permissions);
      }

      if (!workflowHasPermissions && !jobHasPermissions) {
        missing.push(`${relativePath} job ${jobName}`);
      }
    }
  }

  assert.deepEqual(missing, []);
});
