import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { structuredArtifactOwner as owner } from '../modularity-guard-policy.mjs';
import { AUDITED_IMPORTS, scan } from './t410-reference-guard.mjs';

const AUDITED = 'apps/web/src/components/notifications/notification-center.tsx';
const TEST_UI = 'apps/web/src/components/notifications/notification-test-ui.tsx';
const OTHER = 'apps/web/src/x.tsx';
const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const SKIP = new Set(
  '__mocks__ __tests__ build dist e2e fixtures node_modules stories test tests'.split(' ')
);
function isSource(file) {
  return (
    /\.[cm]?[jt]sx?$/u.test(file) &&
    !/(?:\.d\.[cm]?ts|\.(?:fixture|mock|spec|stories|test)\.[cm]?[jt]sx?)$/u.test(file) &&
    file !== TEST_UI &&
    /^(?:apps\/web|packages\/[^/]+)\/src\//u.test(file) &&
    !file.split('/').some(segment => SKIP.has(segment))
  );
}

function walk(root, directory, files) {
  if (!fs.existsSync(directory)) return;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP.has(entry.name)) walk(root, absolute, files);
    } else if (entry.isFile()) {
      const relative = path.relative(root, absolute).replaceAll(path.sep, '/');
      if (isSource(relative)) files.push(relative);
    }
  }
}

function consumers(root) {
  const files = [];
  for (const sourceRoot of ['apps/web/src', 'packages'])
    walk(root, path.join(root, sourceRoot), files);
  return files
    .filter(file => scan(fs.readFileSync(path.join(root, file), 'utf8'), file).hook)
    .sort();
}

const boundary = discovered => ({
  unexpected: discovered.filter(file => file !== AUDITED),
  missing: discovered.includes(AUDITED) ? [] : [AUDITED],
});

test('i18n', () => {
  for (const locale of ['en', 'mk', 'sq', 'sr'])
    assert.equal(
      owner(`apps/web/src/messages/${locale}/notifications.json`),
      't410-notification-acknowledgement-i18n-contract'
    );

  assert.equal(owner('apps/web/src/messages/de/notifications.json'), null);
  assert.equal(owner('apps/web/src/messages/en/unrelated.json'), null);
});

test('AST references versus string data', () => {
  for (const [name, field] of [
    ['useOptimistic', 'hook'],
    ['cancelClaim', 'forbidden'],
  ])
    for (const [expected, cases] of [
      [
        true,
        [
          `import{'NAME'as hook}from'x'`,
          `export{'NAME'as hook}from'x'`,
          `x.NAME()`,
          `x[('NAME')]`,
          `const value={NAME}`,
          `const alias=key;x[alias];const key='NAME'`,
          `<b/>;const{'NAME':hook}=x`,
          `const {NAME}=x`,
          `const key='NAME',{[key]:hook=fallback}=x`,
          `let hook;({NAME:hook}=x);hook([],reducer)`,
          `let NAME;({NAME}=x)`,
          `const key='NAME';({[key]:hook=fallback}=x)`,
          `[{nested:{NAME:hook}}]=x`,
          `const a=x.NAME,b=a,c=b;c()`,
          `const callable=x.NAME<State>;callable(state)`,
          `class C extends (x.NAME(),Base) {}`,
        ],
      ],
      [
        false,
        [
          `//NAME\n'NAME';({NAME:0}as{NAME:number})`,
          `const label='NAME';return <span>{label}</span>`,
          `const event='NAME';analytics.track(event);event()`,
          `const key='NAME',alias=key;const value={alias};fn(alias)`,
          `({safe}= {NAME:hook});target={NAME:hook}`,
          `interface X{NAME():void};class X{NAME(){}}`,
          `interface X extends R.NAME{};class C implements R.NAME{}`,
          `type X=typeof React.NAME`,
          `import type {NAME} from 'react';export type {NAME}`,
          `import {type NAME} from 'react';export {type NAME}`,
          `const key='NAME';function f(){const key='safe';x[key]}`,
          `const a=b,b=a;x[a]`,
          `<Widget NAME='NAME'/>`,
        ],
      ],
    ])
      for (const source of cases) {
        const input = source.replaceAll('NAME', name);
        assert.equal(scan(input)[field], expected, input);
      }
});

test('audited runtime dependencies', () => {
  for (const [module, names] of AUDITED_IMPORTS)
    for (const name of names)
      assert.deepEqual(scan(`import {'${name}' as local} from '${module}'`).unaudited, []);

  for (const source of [
    `import type { Payment } from 'unreviewed'`,
    `import { type Payment } from 'unreviewed'`,
    `export type { Payment } from 'unreviewed'`,
    `export { type Payment } from 'unreviewed'`,
    `export type * from 'unreviewed'`,
    `import type Payment = require('unreviewed')`,
    `import {type Payment, markAsRead as ack} from '@/actions/notifications'`,
    `export {markAsRead as ack} from '@/actions/notifications'`,
    `const label='require';analytics.track(label)`,
    `const x={require:'display'};type T=typeof import('unreviewed')`,
  ])
    assert.deepEqual(scan(source).unaudited, [], source);

  for (const source of [
    `import {run as innocent} from 'unreviewed'`,
    `import {newAction as innocent} from '@/actions/notifications'`,
    `import {markAsRead} from 'unreviewed'`,
    `import {type Payment, newAction} from '@/actions/notifications'`,
    `import unknown from 'react'`,
    `import * as actions from '@/actions/notifications'`,
    `import '@/actions/notifications'`,
    `import {} from '@/actions/notifications'`,
    `export {run as innocent} from 'unreviewed'`,
    `export {newAction as innocent} from '@/actions/notifications'`,
    `export * from '@/actions/notifications'`,
    `export * as actions from '@/actions/notifications'`,
    `export {} from '@/actions/notifications'`,
    `import actions = require('@/actions/notifications')`,
    `import('@/actions/notifications')`,
    `const load=require;load('@/actions/notifications')`,
    `module['require']('@/actions/notifications')`,
  ])
    assert.ok(scan(source).unaudited.length > 0, source);
});

test('money and legal command inventory cannot enter through unaudited imports', () => {
  // Source-backed commands/wrappers from the bounded T410 inventory, not a verb heuristic.
  const writers = `
    updateStatus updateStatusAction persistAuthorizedTransition
    saveNoFeeEvidenceCore saveStaffNoFeeEvidenceCore upsertRecoveryDecisionRecord
    updateCommissionStatus updateCommissionStatusCore bulkApproveCommissions bulkApproveCommissionsCore
    createCommission createCommissionCore createRenewalCommissionCore
    updateAgentCommissionRates updateAgentCommissionRatesCore
    updateMemberReferralRewardStatus updateMemberReferralRewardStatusAdminCore
    updateMemberReferralRewardStatusCore createMemberReferralRewardCore
    updateMemberReferralProgramSettings updateMemberReferralProgramSettingsCore
    upsertMemberReferralProgramSettingsCore startPaymentAction startPayment
    verifyCashAction verifyCashPayment verifyCashAttemptAction verifyCashAttemptCore
    resubmitCashAttemptAction resubmitCashAttemptCore convertLeadToMember
    registerMember registerMemberCore importMembersCore relayRecoverySuccessFeeBillingEvents
    handlePaddleEvent handleSubscriptionChanged handleSubscriptionPastDue upsertSubscription
    persistInvoiceAndLedgerInvariants handleNewSubscriptionExtras handleRenewalSubscriptionExtras
    executeMemberEntityMigration rollbackMemberEntityMigration
    recordJurisdictionHandoff recordJurisdictionHandoffInTransaction
    setRecoveryLegalTenantIfUnset insertHandoffGrant
  `
    .trim()
    .split(/\s+/u);
  for (const name of writers) {
    // These synthetic imports exercise admission independently of name-based matching.
    assert.deepEqual(scan(`import {${name} as harmless} from 'unreviewed'`).unaudited, [
      `unreviewed:${name}`,
    ]);
    assert.ok(scan(`import {${name} as harmless} from '@/actions/notifications'`).unaudited.length);
    assert.ok(scan(`export {${name} as harmless} from 'unreviewed'`).unaudited.length);
    assert.equal(scan(`const label='${name}';analytics.track(label)`).forbidden, false);
  }
  for (const name of `
    getAllCommissions getMyCommissions getGlobalCommissionSummary preflightCommissionPayability
    calculateCommission listMemberReferralRewards calculateSuccessFeeAmount resolveSuccessFeeCollectionPlan
    canTransition evaluateRecoveryInvariants assignClaim assignOwner unassignOwner
    updateAgentTier updateUserAgent registerMemberPOS handleTransactionCompleted getPaymentUpdateUrl
  `
    .trim()
    .split(/\s+/u))
    assert.equal(scan(`${name}()`).forbidden, false, name);
  for (const name of ['updateCommissionStatus', 'bulkApproveCommissions'])
    assert.ok(scan(`${name}()`).forbidden, name);
});

test('guard', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 't410-'));
  const write = (file, source) => {
    const target = path.join(root, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, source);
  };
  try {
    write(AUDITED, "import { useOptimistic } from 'react';");
    write(OTHER, "import * as React from 'react'; React.useOptimistic([]);");
    assert.deepEqual(boundary(consumers(root)), { unexpected: [OTHER], missing: [] });
    assert.ok(
      'updateClaimStatus cancelClaimCore createClaimFromSavedDraft cancelSubscriptionCore saveStaffRecoveryDecisionCore saveSuccessFeeCollection issuePayoutSettlement submitAirlineClaim activateSponsoredMembership'
        .split(' ')
        .every(name => scan(`import{${name}}from'x'`).forbidden)
    );
    write(AUDITED, 'export const settled = true;');
    assert.deepEqual(boundary(consumers(root)), { unexpected: [OTHER], missing: [AUDITED] });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('repo', () => {
  assert.ok(isSource('packages/x/src/a.mjs') && !isSource(TEST_UI));
  assert.deepEqual(boundary(consumers(ROOT)), { unexpected: [], missing: [] });
  const audited = scan(fs.readFileSync(path.join(ROOT, AUDITED), 'utf8'), AUDITED);
  assert.ok(!audited.forbidden);
  assert.deepEqual(audited.unaudited, []);
});
