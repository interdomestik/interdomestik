import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  pullRequestsPath,
  qualityGatePath,
  runGateScript,
  startSonarApiServer,
  writeGhResponse,
} from './sonar-check-run-gate.test-support.mjs';

test('sonar check-run gate accepts PR quality gate API results when the Sonar check suite is stuck queued without runs', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sonar-check-run-gate-'));
  const binDir = path.join(tempRoot, 'bin');
  const responsesDir = path.join(tempRoot, 'responses');
  const evidenceDir = path.join(tempRoot, 'evidence');
  const eventPath = path.join(tempRoot, 'event.json'),
    stepSummaryPath = path.join(tempRoot, 'github-step-summary.md');

  for (const dir of [binDir, responsesDir]) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(eventPath, JSON.stringify({ pull_request: { number: 307 } }));

  const mockGhPath = path.join(binDir, 'gh');
  fs.writeFileSync(
    mockGhPath,
    `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');

const args = process.argv.slice(2);
if (args[0] !== 'api') {
  process.stderr.write('Unsupported gh command\\n');
  process.exit(2);
}

const endpoint = args.at(-1);
const responsePath = path.join(
  process.env.MOCK_GH_RESPONSES_DIR,
  endpoint.replace(/[^A-Za-z0-9._-]+/g, '_') + '.json'
);

if (!fs.existsSync(responsePath)) {
  process.stderr.write(\`Missing mock response for \${endpoint}\\n\`);
  process.exit(2);
}

process.stdout.write(fs.readFileSync(responsePath, 'utf8'));
`,
    { mode: 0o700 }
  );

  const checkRunsEndpoint =
    'repos/interdomestik/interdomestik/commits/test-sha/check-runs?filter=latest&per_page=100';
  const checkSuitesEndpoint =
    'repos/interdomestik/interdomestik/commits/test-sha/check-suites?filter=latest&per_page=100';
  const statusEndpoint = 'repos/interdomestik/interdomestik/commits/test-sha/status';

  writeGhResponse(responsesDir, checkRunsEndpoint, { check_runs: [] });
  writeGhResponse(responsesDir, checkSuitesEndpoint, {
    check_suites: [
      {
        app: {
          slug: 'sonarqubecloud',
          name: 'SonarQubeCloud',
        },
        status: 'queued',
        conclusion: null,
        latest_check_runs_count: 0,
        updated_at: '2026-03-12T14:39:12Z',
        created_at: '2026-03-12T14:39:04Z',
      },
    ],
  });
  writeGhResponse(responsesDir, statusEndpoint, { statuses: [] });

  const server = await startSonarApiServer({
    [pullRequestsPath]: {
      pullRequests: [
        {
          key: '307',
          commit: {
            sha: 'test-sha',
          },
        },
      ],
    },
    [qualityGatePath]: {
      projectStatus: {
        status: 'OK',
      },
    },
  });

  try {
    const result = await runGateScript({
      ...process.env,
      EVIDENCE_DIR: evidenceDir,
      GH_BIN_PATH: mockGhPath,
      GH_TOKEN: 'test-gh-token',
      GITHUB_EVENT_PATH: eventPath,
      GITHUB_REPOSITORY: 'interdomestik/interdomestik',
      GITHUB_STEP_SUMMARY: stepSummaryPath,
      MOCK_GH_RESPONSES_DIR: responsesDir,
      SONAR_CHECK_MAX_RETRIES: '1',
      SONAR_CHECK_RETRY_DELAY_SECONDS: '0',
      SONAR_CHECK_SHA: 'test-sha',
      SONAR_HOST_URL: server.origin,
      SONAR_PROJECT_KEY: 'interdomestik_interdomestik',
      SONAR_TOKEN: 'test-sonar-token',
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);

    for (const summary of [
      fs.readFileSync(path.join(evidenceDir, 'notes', 'sonar-summary.md'), 'utf8'),
      fs.readFileSync(stepSummaryPath, 'utf8'),
    ]) {
      assert.match(summary, /source: Sonar quality gate API/);
      assert.match(summary, /conclusion: OK/);
    }
  } finally {
    await server.close();
  }
});
