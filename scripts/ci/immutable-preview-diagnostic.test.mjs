import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import yaml from 'js-yaml';

import {
  APPROVED_PREVIEW_ORIGIN,
  EXPECTED_COMMIT_SHA,
  assertApprovedPreviewOrigin,
  assertExpectedHealth,
  assertTrustedPreflightReceipt,
  classifyDiagnosticError,
  createReadOnlyRequestPolicy,
  resolveApprovedRedirect,
  sanitizeDiagnosticUrl,
  sanitizePageTitle,
  sanitizeSessionSummary,
} from './immutable-preview-diagnostic-lib.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('accepts only the exact approved immutable preview origin', () => {
  assert.equal(assertApprovedPreviewOrigin(APPROVED_PREVIEW_ORIGIN), APPROVED_PREVIEW_ORIGIN);

  for (const rejected of [
    'http://interdomestik-16cnb0jg6-ecohub.vercel.app',
    'https://staging.interdomestik.com',
    'https://interdomestik-16cnb0jg6-ecohub.vercel.app.attacker.example',
    'https://interdomestik-16cnb0jg6-ecohub.vercel.app/path',
    'https://user:password@interdomestik-16cnb0jg6-ecohub.vercel.app',
  ]) {
    assert.throws(
      () => assertApprovedPreviewOrigin(rejected),
      /approved immutable preview origin/u
    );
  }
});

test('rejects health evidence unless it is the exact preview build SHA', () => {
  assert.deepEqual(
    assertExpectedHealth(
      {
        status: 'healthy',
        build: { commitSha: EXPECTED_COMMIT_SHA, deployEnv: 'preview' },
      },
      EXPECTED_COMMIT_SHA
    ),
    { status: 'healthy', commitSha: EXPECTED_COMMIT_SHA, deployEnv: 'preview' }
  );

  assert.throws(
    () =>
      assertExpectedHealth(
        { status: 'healthy', build: { commitSha: '0'.repeat(40), deployEnv: 'preview' } },
        EXPECTED_COMMIT_SHA
      ),
    /commit SHA mismatch/u
  );
  assert.throws(
    () =>
      assertExpectedHealth(
        { status: 'healthy', build: { commitSha: EXPECTED_COMMIT_SHA, deployEnv: 'production' } },
        EXPECTED_COMMIT_SHA
      ),
    /preview deployment/u
  );
});

test('read-only request policy permits login but blocks every other unsafe request', () => {
  const classify = createReadOnlyRequestPolicy(APPROVED_PREVIEW_ORIGIN);

  assert.equal(
    classify({ method: 'POST', url: `${APPROVED_PREVIEW_ORIGIN}/api/auth/sign-in/email` }),
    'allow-login'
  );
  assert.equal(
    classify({ method: 'POST', url: `${APPROVED_PREVIEW_ORIGIN}/en/admin/users/example` }),
    'block-unsafe'
  );
  assert.equal(
    classify({
      method: 'POST',
      url: `${APPROVED_PREVIEW_ORIGIN}/api/auth/sign-in/email?callbackURL=https://attacker.example`,
    }),
    'block-unsafe'
  );
  assert.equal(
    classify({ method: 'DELETE', url: `${APPROVED_PREVIEW_ORIGIN}/api/admin/users/example` }),
    'block-unsafe'
  );
  assert.equal(
    classify({ method: 'GET', url: 'https://attacker.example/collect' }),
    'block-origin'
  );
  assert.equal(
    classify({ method: 'GET', url: `${APPROVED_PREVIEW_ORIGIN}/en/admin` }),
    'allow-read'
  );
});

test('redirect validation rejects any origin change before credentials can follow it', () => {
  assert.equal(
    resolveApprovedRedirect(
      `${APPROVED_PREVIEW_ORIGIN}/api/health`,
      '/api/health/',
      APPROVED_PREVIEW_ORIGIN
    ),
    `${APPROVED_PREVIEW_ORIGIN}/api/health/`
  );
  assert.throws(
    () =>
      resolveApprovedRedirect(
        `${APPROVED_PREVIEW_ORIGIN}/api/health`,
        'https://attacker.example/collect',
        APPROVED_PREVIEW_ORIGIN
      ),
    /escaped the approved preview origin/u
  );
});

test('diagnostic URL and title evidence keeps only enumerated non-sensitive values', () => {
  assert.equal(
    sanitizeDiagnosticUrl(
      `${APPROVED_PREVIEW_ORIGIN}/en/admin/users/example?tenantId=tenant_ks&token=secret`
    ),
    `${APPROVED_PREVIEW_ORIGIN}/en/admin/users/[REDACTED_ID]`
  );
  assert.equal(
    sanitizeDiagnosticUrl('https://attacker.example/a/JWT-shaped-secret'),
    '[EXTERNAL_ORIGIN]/[REDACTED_PATH]'
  );
  assert.equal(sanitizePageTitle('Interdomestik - Consumer Protection'), 'public-shell');
  assert.equal(sanitizePageTitle('Admin user Jane Example — private account'), 'redacted');
});

test('session evidence is an allowlist and never retains identity or token material', () => {
  const summary = sanitizeSessionSummary(
    {
      session: { token: 'session-secret' },
      user: {
        email: 'admin.ks@interdomestik.com',
        name: 'Arbër Krasniqi',
        role: 'tenant_admin',
        tenantId: 'tenant_ks',
        accessTenantId: 'tenant_ks',
      },
    },
    'admin.ks@interdomestik.com'
  );
  assert.deepEqual(summary, {
    identityMatchesExpected: true,
    role: 'tenant_admin',
    tenantId: 'tenant_ks',
    accessTenantId: 'tenant_ks',
  });
  assert.doesNotMatch(JSON.stringify(summary), /Arbër|@|session-secret/u);
});

test('browser errors are reduced to non-sensitive categories', () => {
  assert.equal(
    classifyDiagnosticError(
      'Hydration failed for Arbër Krasniqi admin.ks@interdomestik.com token=secret'
    ),
    'hydration'
  );
  assert.equal(classifyDiagnosticError('net::ERR_CONNECTION_RESET'), 'network');
  assert.equal(classifyDiagnosticError('Private member payload: Jane Example'), 'generic');
  assert.doesNotMatch(
    JSON.stringify([
      classifyDiagnosticError('Private member payload: Jane Example'),
      classifyDiagnosticError('admin.ks@interdomestik.com'),
    ]),
    /Jane|admin\.ks|@/u
  );
});

test('credential-bearing phase accepts only the same trusted workflow preflight receipt', () => {
  const receipt = {
    status: 'verified',
    runId: '1234',
    runAttempt: '2',
    origin: APPROVED_PREVIEW_ORIGIN,
    commitSha: EXPECTED_COMMIT_SHA,
    deployEnv: 'preview',
  };
  assert.deepEqual(assertTrustedPreflightReceipt(receipt, '1234', '2'), receipt);
  assert.throws(() => assertTrustedPreflightReceipt(receipt, '9999', '2'), /workflow run/u);
  assert.throws(
    () => assertTrustedPreflightReceipt({ ...receipt, commitSha: '0'.repeat(40) }, '1234', '2'),
    /commit SHA/u
  );
});

test('manual workflow is staging-protected, least-privilege, read-only, and short-retention', () => {
  const workflowPath = path.join(root, '.github/workflows/immutable-preview-diagnostic.yml');
  const source = fs.readFileSync(workflowPath, 'utf8');
  const workflow = yaml.load(source);

  assert.deepEqual(Object.keys(workflow.on), ['workflow_dispatch']);
  assert.deepEqual(workflow.permissions, { contents: 'read' });

  const job = workflow.jobs.diagnose;
  assert.deepEqual(job.environment, { name: 'staging', deployment: false });
  assert.equal(job.if, "github.ref == 'refs/heads/main'");
  assert.equal(job.env.DIAGNOSTIC_PREVIEW_ORIGIN, APPROVED_PREVIEW_ORIGIN);
  assert.equal(job.env.DIAGNOSTIC_EXPECTED_SHA, EXPECTED_COMMIT_SHA);

  const preflightStep = job.steps.find(step => step.name === 'Verify immutable preview provenance');
  assert.equal(preflightStep.run, 'node scripts/ci/immutable-preview-diagnostic.mjs --preflight');
  assert.deepEqual(Object.keys(preflightStep.env), ['VERCEL_AUTOMATION_BYPASS_SECRET']);

  const runStep = job.steps.find(step => step.name === 'Run immutable preview diagnostic');
  assert.equal(runStep.run, 'node scripts/ci/immutable-preview-diagnostic.mjs');
  assert.deepEqual(Object.keys(runStep.env).sort(), [
    'RELEASE_GATE_ADMIN_KS_EMAIL',
    'RELEASE_GATE_ADMIN_KS_PASSWORD',
    'VERCEL_AUTOMATION_BYPASS_SECRET',
  ]);

  const artifactStep = job.steps.find(step => step.name === 'Upload sanitized diagnostic receipt');
  assert.equal(artifactStep.with['retention-days'], 1);
  assert.equal(artifactStep.with['if-no-files-found'], 'error');

  assert.doesNotMatch(
    source,
    /\b(?:deploy|seed|grantUserRole|revokeUserRole|trace|screenshot)\b/iu
  );
  assert.match(
    fs.readFileSync(path.join(root, 'scripts/ci/immutable-preview-diagnostic.mjs'), 'utf8'),
    /routeWebSocket/u
  );
});
