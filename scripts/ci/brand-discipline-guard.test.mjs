import assert from 'node:assert/strict';
import test from 'node:test';

import { CHECKED_SURFACES } from '../brand-discipline-policy.mjs';
import { createTempRoot, runScript, writeFile } from '../plan-test-helpers.mjs';

const locales = ['sq', 'en', 'sr', 'mk'];

function messageFixture(overrides = {}) {
  return {
    pricing: {
      disclaimers: {
        freeStart: {
          body:
            overrides.pricingFreeStart ??
            'Free Start gives you informational guidance, templates, and next-step tools. It does not start human review, legal advice, or staff-led recovery.',
        },
      },
    },
    servicesPage: {
      disclaimers: {
        freeStart: {
          body: 'Free Start gives you informational guidance, templates, and next-step tools. It does not start human review, legal advice, or staff-led recovery.',
        },
      },
      categories: {
        expertise: {
          services: [
            { description: 'Case acceptance comes first.' },
            {
              description:
                overrides.recoveryDescription ??
                'Recovery work starts only after case acceptance and an escalation agreement.',
            },
          ],
        },
      },
    },
    freeStart: {
      trust: {
        triage: {
          body: 'Free Start stays informational, and the hotline stays routing-only until membership starts the review clock.',
        },
      },
    },
    membership: {
      disclaimers: {
        freeStart: {
          body: 'Free Start gives you informational guidance, templates, and next-step tools. It does not start human review, legal advice, or staff-led recovery.',
        },
      },
    },
  };
}

function writeFixture(root, overrides = {}) {
  const fixture = messageFixture(overrides);
  for (const locale of locales) {
    for (const [name, content] of Object.entries(fixture)) {
      writeFile(root, `apps/web/src/messages/${locale}/${name}.json`, JSON.stringify(content));
    }
  }
  writeFile(
    root,
    'packages/domain-communications/src/email/thank-you-letter.ts',
    "export const refund = '30-day launch refund window';\n"
  );
}

function runGuard(root) {
  return runScript('scripts/check-brand-discipline.mjs', root, [`--root=${root}`]);
}

function runGuardWithSplitRoot(root) {
  return runScript('scripts/check-brand-discipline.mjs', root, ['--root', root]);
}

test('brand discipline surface inventory is explicit for T-007 checked surfaces', () => {
  const ids = CHECKED_SURFACES.map(surface => surface.id);
  assert.deepEqual(ids, [
    'supported messages/**',
    'checkout/registration conversion copy',
    'eligibility/Free Start result copy',
    'recovery activation copy',
    'email-template copy',
  ]);
});

test('brand discipline guard blocks seeded banned framing', () => {
  const root = createTempRoot('brand-discipline-banned-');
  writeFixture(root, { pricingFreeStart: 'Guaranteed compensation with No Win, No Fee.' });

  const failed = runGuard(root);
  assert.equal(failed.status, 1, failed.stderr);
  assert.match(failed.stderr, /banned brand\/compliance framing/);
  assert.match(failed.stderr, /no-win-no-fee framing|guaranteed service\/result framing/);
});

test('brand discipline guard blocks missing required protective messages', () => {
  const root = createTempRoot('brand-discipline-missing-');
  writeFixture(root);
  writeFile(root, 'apps/web/src/messages/en/freeStart.json', JSON.stringify({ freeStart: {} }));

  const failed = runGuard(root);
  assert.equal(failed.status, 1, failed.stderr);
  assert.match(failed.stderr, /required protective message is missing/);
  assert.match(failed.stderr, /apps\/web\/src\/messages\/en\/freeStart\.json/);
  assert.match(failed.stderr, /freeStart\.trust\.triage\.body/);
});

test('repo brand discipline baseline is explicit and current', () => {
  const passed = runGuard(process.cwd());
  assert.equal(passed.status, 0, passed.stderr);
  assert.match(passed.stdout, /Brand discipline guard passed/);
});

test('brand discipline guard accepts space-separated root argument', () => {
  const passed = runGuardWithSplitRoot(process.cwd());
  assert.equal(passed.status, 0, passed.stderr);
  assert.match(passed.stdout, /Brand discipline guard passed/);
});
