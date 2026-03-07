import http from 'node:http';
import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { spawn } from 'node:child_process';

import { evaluateMultiAgentPolicy, evaluatePackageJsonRisk } from './multi-agent-policy-lib.mjs';
import { createTempRoot, runScript, writeFile } from '../plan-test-helpers.mjs';

function runScriptAsync(scriptPath, root, args = [], options = {}) {
  const absoluteScriptPath = path.resolve(process.cwd(), scriptPath);

  return new Promise(resolve => {
    const child = spawn(process.execPath, [absoluteScriptPath, ...args], {
      cwd: root,
      env: {
        ...process.env,
        ...options.env,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', chunk => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', chunk => {
      stderr += chunk.toString();
    });

    child.on('close', (status, signal) => {
      resolve({
        status: status ?? 1,
        signal,
        stdout,
        stderr,
      });
    });
  });
}

test('manual dispatch always runs full multi-agent hardening', () => {
  assert.deepEqual(
    evaluateMultiAgentPolicy({
      eventName: 'workflow_dispatch',
      labels: [],
      changedFiles: [],
    }),
    {
      shouldRun: true,
      reason: 'manual_dispatch',
      matchedPaths: [],
    }
  );
});

test('explicit CI label forces full multi-agent hardening', () => {
  assert.deepEqual(
    evaluateMultiAgentPolicy({
      eventName: 'pull_request',
      labels: ['ci:multi-agent'],
      changedFiles: ['apps/web/src/features/member/home.tsx'],
    }),
    {
      shouldRun: true,
      reason: 'label:ci:multi-agent',
      matchedPaths: [],
    }
  );
});

test('high-risk multi-agent infrastructure changes trigger full multi-agent hardening', () => {
  assert.deepEqual(
    evaluateMultiAgentPolicy({
      eventName: 'pull_request',
      labels: [],
      changedFiles: [
        'scripts/multi-agent/orchestrator.sh',
        'apps/web/src/features/member/home.tsx',
      ],
    }),
    {
      shouldRun: true,
      reason: 'high_risk_paths',
      matchedPaths: ['scripts/multi-agent/orchestrator.sh'],
    }
  );
});

test('routing authority changes trigger full multi-agent hardening', () => {
  assert.deepEqual(
    evaluateMultiAgentPolicy({
      eventName: 'pull_request',
      labels: [],
      changedFiles: ['apps/web/src/proxy.ts'],
    }),
    {
      shouldRun: true,
      reason: 'high_risk_paths',
      matchedPaths: ['apps/web/src/proxy.ts'],
    }
  );
});

test('critical database tenant guard changes still trigger full multi-agent hardening', () => {
  assert.deepEqual(
    evaluateMultiAgentPolicy({
      eventName: 'pull_request',
      labels: [],
      changedFiles: ['packages/database/src/tenant-security.ts'],
    }),
    {
      shouldRun: true,
      reason: 'high_risk_paths',
      matchedPaths: ['packages/database/src/tenant-security.ts'],
    }
  );
});

test('broad database product changes require explicit label before full multi-agent hardening', () => {
  assert.deepEqual(
    evaluateMultiAgentPolicy({
      eventName: 'pull_request',
      labels: [],
      changedFiles: ['packages/database/src/schema/claims.ts'],
    }),
    {
      shouldRun: false,
      reason: 'label_required_for_high_risk_paths',
      matchedPaths: ['packages/database/src/schema/claims.ts'],
    }
  );
});

test('database migration changes require explicit label before full multi-agent hardening', () => {
  assert.deepEqual(
    evaluateMultiAgentPolicy({
      eventName: 'pull_request',
      labels: [],
      changedFiles: ['packages/database/drizzle/0035_enable_tenant_rls_coverage.sql'],
    }),
    {
      shouldRun: false,
      reason: 'label_required_for_high_risk_paths',
      matchedPaths: ['packages/database/drizzle/0035_enable_tenant_rls_coverage.sql'],
    }
  );
});

test('normal product changes skip full multi-agent hardening', () => {
  assert.deepEqual(
    evaluateMultiAgentPolicy({
      eventName: 'pull_request',
      labels: [],
      changedFiles: [
        'apps/web/src/features/member/home.tsx',
        'apps/web/src/features/member/home.test.tsx',
      ],
    }),
    {
      shouldRun: false,
      reason: 'default_skip_non_risky_pr',
      matchedPaths: [],
    }
  );
});

test('harmless root package.json script changes do not trigger full multi-agent hardening', () => {
  const packageJsonRisk = evaluatePackageJsonRisk({
    beforeContent: JSON.stringify({
      scripts: {
        check: 'pnpm lint',
      },
    }),
    afterContent: JSON.stringify({
      scripts: {
        check: 'pnpm lint',
        'e2e:gate:pr': 'pnpm --filter @interdomestik/web exec playwright test',
        'e2e:gate:pr:fast': 'pnpm --filter @interdomestik/web exec playwright test --grep @fast',
        'check:fast': 'pnpm e2e:gate:pr:fast',
      },
    }),
  });

  assert.deepEqual(
    evaluateMultiAgentPolicy({
      eventName: 'pull_request',
      labels: [],
      changedFiles: ['package.json'],
      packageJsonRisk,
    }),
    {
      shouldRun: false,
      reason: 'default_skip_non_risky_pr',
      matchedPaths: [],
    }
  );
});

test('root package.json dependency changes still trigger full multi-agent hardening', () => {
  const packageJsonRisk = evaluatePackageJsonRisk({
    beforeContent: JSON.stringify({
      devDependencies: {
        vitest: '^3.0.0',
      },
    }),
    afterContent: JSON.stringify({
      devDependencies: {
        vitest: '^3.1.0',
      },
    }),
  });

  assert.deepEqual(
    evaluateMultiAgentPolicy({
      eventName: 'pull_request',
      labels: [],
      changedFiles: ['package.json'],
      packageJsonRisk,
    }),
    {
      shouldRun: true,
      reason: 'high_risk_paths',
      matchedPaths: ['package.json:devDependencies'],
    }
  );
});

test('root package.json changes to critical verification scripts still trigger full multi-agent hardening', () => {
  const packageJsonRisk = evaluatePackageJsonRisk({
    beforeContent: JSON.stringify({
      scripts: {
        'pr:verify': 'pnpm check:fast',
        'check:fast': 'pnpm lint',
      },
    }),
    afterContent: JSON.stringify({
      scripts: {
        'pr:verify': 'pnpm check:fast && pnpm test',
        'check:fast': 'pnpm lint',
      },
    }),
  });

  assert.deepEqual(
    evaluateMultiAgentPolicy({
      eventName: 'pull_request',
      labels: [],
      changedFiles: ['package.json'],
      packageJsonRisk,
    }),
    {
      shouldRun: true,
      reason: 'high_risk_paths',
      matchedPaths: ['package.json:scripts.pr:verify'],
    }
  );
});

test('CLI resolves safe package.json changes from GitHub file contents and skips full hardening', async () => {
  const root = createTempRoot('multi-agent-policy-package-json-cli-');
  const eventPath = path.join(root, 'event.json');
  const changedFilesPath = path.join(root, 'changed-files.txt');
  const beforeContent = JSON.stringify({
    scripts: {
      check: 'pnpm lint',
    },
  });
  const afterContent = JSON.stringify({
    scripts: {
      check: 'pnpm lint',
      'e2e:gate:pr': 'pnpm --filter @interdomestik/web exec playwright test',
      'e2e:gate:pr:fast': 'pnpm --filter @interdomestik/web exec playwright test --grep @fast',
      'check:fast': 'pnpm e2e:gate:pr:fast',
    },
  });

  writeFile(
    root,
    'event.json',
    JSON.stringify({
      pull_request: {
        labels: [],
        base: { sha: 'base-ref' },
        head: { sha: 'head-ref' },
      },
      repository: {
        full_name: 'interdomestik/interdomestik',
      },
    })
  );
  writeFile(root, 'changed-files.txt', 'package.json\n');

  const server = http.createServer((request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');

    if (url.pathname !== '/repos/interdomestik/interdomestik/contents/package.json') {
      response.writeHead(404, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ message: 'not found' }));
      return;
    }

    const ref = url.searchParams.get('ref');
    const content = ref === 'base-ref' ? beforeContent : ref === 'head-ref' ? afterContent : null;

    if (!content) {
      response.writeHead(404, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ message: 'unknown ref' }));
      return;
    }

    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(
      JSON.stringify({
        content: Buffer.from(content, 'utf8').toString('base64'),
        encoding: 'base64',
      })
    );
  });

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const apiBaseUrl =
    typeof address === 'object' && address ? `http://127.0.0.1:${address.port}` : '';

  try {
    const result = await runScriptAsync(
      'scripts/ci/multi-agent-policy.mjs',
      root,
      [
        '--event-name',
        'pull_request',
        '--event-path',
        eventPath,
        '--changed-files-path',
        changedFilesPath,
      ],
      {
        env: {
          GH_TOKEN: 'test-token',
          GITHUB_API_URL: apiBaseUrl,
        },
      }
    );

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /^should_run=false$/m);
    assert.match(result.stdout, /^reason=default_skip_non_risky_pr$/m);
    assert.match(result.stdout, /^matched_paths=\[\]$/m);
  } finally {
    await new Promise((resolve, reject) =>
      server.close(error => (error ? reject(error) : resolve()))
    );
  }
});

test('CLI prints GitHub output fields for risky PR changes', () => {
  const root = createTempRoot('multi-agent-policy-cli-');
  const eventPath = path.join(root, 'event.json');
  const changedFilesPath = path.join(root, 'changed-files.txt');

  writeFile(
    root,
    'event.json',
    JSON.stringify({
      pull_request: {
        labels: [],
      },
    })
  );
  writeFile(root, 'changed-files.txt', 'scripts/multi-agent/orchestrator.sh\n');

  const result = runScript('scripts/ci/multi-agent-policy.mjs', root, [
    '--event-name',
    'pull_request',
    '--event-path',
    eventPath,
    '--changed-files-path',
    changedFilesPath,
  ]);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^should_run=true$/m);
  assert.match(result.stdout, /^reason=high_risk_paths$/m);
  assert.match(result.stdout, /matched_paths=\["scripts\/multi-agent\/orchestrator\.sh"\]/);
});
