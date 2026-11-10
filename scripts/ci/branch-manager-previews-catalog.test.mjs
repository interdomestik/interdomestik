import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { structuredArtifactOwner } from '../modularity-guard-policy.mjs';

const locales = ['sq', 'en', 'sr', 'mk', 'de'];
const handoffKeys = [
  'title',
  'restriction',
  'search',
  'status',
  'branch',
  'assignee',
  'createdAt',
  'updatedAt',
  'acceptedAt',
  'reassignedAt',
  'closedAt',
  'publicResponseAt',
  'publicResponseCount',
  'memberReplyAt',
  'count',
];
const eventKeys = [
  'claimSubmitted',
  'claimAssigned',
  'statusChanged',
  'claimPackGenerated',
  'claimPackUpgraded',
  'documentRequested',
  'triageComplete',
  'escalationAccepted',
  'escalationDeclined',
  'newMessage',
  'slaWarning',
  'slaBreached',
  'membershipRenewal',
  'paymentVerificationUpdate',
  'supportHandoffPublicResponse',
  'unknown',
];
const read = (locale, file) =>
  JSON.parse(
    readFileSync(
      new URL(`../../apps/web/src/messages/${locale}/${file}.json`, import.meta.url),
      'utf8'
    )
  );

test('BM handoff and event preview copy has five-locale owners and exact content-free keys', () => {
  for (const locale of locales) {
    assert.equal(
      structuredArtifactOwner(`apps/web/src/messages/${locale}/messaging.json`),
      'member-case-communication-i18n-contract'
    );
    assert.equal(
      structuredArtifactOwner(`apps/web/src/messages/${locale}/notifications.json`),
      't410-notification-acknowledgement-i18n-contract'
    );
    const handoffs = read(locale, 'messaging').messaging.branchManager.handoffs;
    assert.deepEqual(Object.keys(handoffs).sort(), [...handoffKeys].sort());
    for (const value of Object.values(handoffs))
      assert.ok(typeof value === 'string' && value.trim());
    const events = read(locale, 'notifications').notifications.branchManager;
    assert.deepEqual(Object.keys(events).sort(), [...eventKeys].sort());
    for (const event of Object.values(events)) {
      assert.deepEqual(Object.keys(event).sort(), ['content', 'title']);
      for (const value of Object.values(event)) {
        assert.ok(typeof value === 'string' && value.trim());
        assert.doesNotMatch(value, /\{.*\}/u, 'Preview copy must never interpolate stored content');
      }
    }
  }
});
