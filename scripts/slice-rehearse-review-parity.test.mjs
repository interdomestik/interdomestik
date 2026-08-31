import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DASHBOARD_LOCALE_PATHS,
  inspectAccessibilityContracts,
  reviewDashboardLocaleParity,
} from './slice-rehearse-review-parity.mjs';
import { detectReviewPaths } from './slice-rehearse-review-paths.mjs';

function portal(title) {
  return {
    dashboard: {
      portal: {
        title,
        description: 'Description',
        disclaimer: 'Disclaimer',
        navigation: {
          label: 'Navigation',
          help_now: 'Help',
          documents: 'Docs',
          membership: 'Plan',
        },
        regions: {
          case: { label: 'Case', loading: 'Loading', empty: 'Empty', error: 'Error' },
          actions: { label: 'Actions', loading: 'Loading', empty: 'Empty', error: 'Error' },
          updates: { label: 'Updates', loading: 'Loading', empty: 'Empty', error: 'Error' },
        },
        actions: {
          none: 'None',
          active: 'Active',
          trialing: 'Trialing',
          active_in_grace: 'Grace',
          grace_expired: 'Expired',
          scheduled_cancel: 'Scheduled',
          canceled: 'Canceled',
        },
      },
    },
  };
}

function catalogs() {
  return Object.fromEntries(
    DASHBOARD_LOCALE_PATHS.map((path, index) => {
      const catalog = portal(`Title ${index}`);
      const localize = value => {
        if (typeof value === 'string') return `${value} ${index}`;
        if (value && typeof value === 'object') {
          for (const [key, child] of Object.entries(value)) value[key] = localize(child);
        }
        return value;
      };
      return [path, localize(catalog)];
    })
  );
}

test('checks the four exact dashboard locale paths with deterministic code-unit ordering', () => {
  const result = reviewDashboardLocaleParity(catalogs());
  assert.deepEqual(result.paths, [...DASHBOARD_LOCALE_PATHS]);
  assert.deepEqual(result.findings, []);
  assert.equal(result.leafCount > 0, true);
});

test('reports semantic type, placeholder, action-state, and missing-locale drift', () => {
  const input = catalogs();
  delete input[DASHBOARD_LOCALE_PATHS[1]].dashboard.portal.actions.canceled;
  input[DASHBOARD_LOCALE_PATHS[2]].dashboard.portal.description = 'Description {name}';
  input[DASHBOARD_LOCALE_PATHS[3]].dashboard.portal.regions.actions.empty = '';
  const missing = { ...input };
  delete missing[DASHBOARD_LOCALE_PATHS[0]];

  assert.match(
    reviewDashboardLocaleParity(input).findings.join('\n'),
    /semantic parity|placeholder|non-empty/u
  );
  assert.match(
    reviewDashboardLocaleParity(missing).findings.join('\n'),
    /exact dashboard locale path/u
  );
});

test('rejects dashboard catalogs cloned wholesale from English', () => {
  const english = portal('English title');
  const cloned = Object.fromEntries(
    DASHBOARD_LOCALE_PATHS.map(path => [path, structuredClone(english)])
  );
  assert.match(reviewDashboardLocaleParity(cloned).findings.join('\n'), /cloned from English/u);
});

test('catches predictable accessibility contract failures locally', () => {
  const findings = inspectAccessibilityContracts(
    '<div role="heading">Title</div><a target="_blank">Docs</a><button></button>'
  );
  assert.match(findings.join('\n'), /semantic heading/u);
  assert.match(findings.join('\n'), /noopener/u);
  assert.match(findings.join('\n'), /accessible name/u);
  assert.match(
    inspectAccessibilityContracts(
      '<button><SaveIcon /></button><Link href="/docs" target="_blank">Docs</Link>'
    ).join('\n'),
    /accessible name|noopener/u
  );
  assert.deepEqual(
    inspectAccessibilityContracts(
      '<h2>Title</h2><button aria-label="Save" /><span id="save">Save</span><button aria-labelledby="save"></button>'
    ),
    []
  );
});

test('review path detection constrains git environment and runtime', () => {
  const calls = [];
  detectReviewPaths('/repo', (binary, args, options) => {
    calls.push({ binary, args, options });
    return { status: 0, stdout: '' };
  });
  assert.equal(calls.length, 4);
  for (const call of calls) {
    assert.equal(call.binary, '/usr/bin/git');
    assert.deepEqual(call.options.env, { PATH: '/usr/bin:/bin:/usr/sbin:/sbin' });
    assert.equal(call.options.timeout, 30_000);
  }
});
