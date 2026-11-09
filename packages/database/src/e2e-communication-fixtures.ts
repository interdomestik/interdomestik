import {
  discoveryAccessIntent,
  E2E_DISCOVERY_ACTORS,
  E2E_DISCOVERY_MESSAGE_READERS,
  E2E_DISCOVERY_INTERNAL_READERS,
  type E2EDiscoveryActor,
} from './e2e-discovery-access';
import { E2E_CASE_FIXTURES, E2E_MESSAGE_FIXTURES, E2E_USER_IDS } from './e2e-role-fixtures';
import { goldenId } from './seed-utils/seed-ids';

type CaseKey = keyof typeof E2E_CASE_FIXTURES;
type MessageKey = 'MEMBER_REQUEST' | 'STAFF_REPLY' | 'INTERNAL_NOTE' | 'AGENT_REPLY';

/** Explicit participants: the KS-B assigned staff cannot message across their branch scope. */
const RESPONDERS = {
  KS_ANCHOR: 'KS_STAFF',
  KS_OTHER_MEMBER: 'KS_STAFF',
  KS_PEER_STAFF: 'KS_STAFF_UNASSIGNED',
  KS_UNASSIGNED: 'KS_STAFF',
  KS_OTHER_BRANCH: 'KS_ADMIN',
  MK_FOREIGN_TENANT: 'MK_STAFF',
} as const;

function legacyMessage(anchor: boolean, key: MessageKey) {
  if (!anchor) return null;
  if (key === 'STAFF_REPLY') return E2E_MESSAGE_FIXTURES.KS_ANCHOR_PUBLIC;
  if (key === 'INTERNAL_NOTE') return E2E_MESSAGE_FIXTURES.KS_ANCHOR_INTERNAL;
  return null;
}

function messageSender(caseKey: CaseKey, key: MessageKey): string {
  if (key === 'MEMBER_REQUEST') return E2E_CASE_FIXTURES[caseKey].ownerUserId;
  if (key === 'AGENT_REPLY') return E2E_USER_IDS.KS_AGENT;
  return E2E_USER_IDS[RESPONDERS[caseKey]];
}

function message(caseKey: CaseKey, key: MessageKey) {
  const claim = E2E_CASE_FIXTURES[caseKey];
  const anchor = caseKey === 'KS_ANCHOR';
  const legacy = legacyMessage(anchor, key);
  const readers =
    key === 'INTERNAL_NOTE'
      ? E2E_DISCOVERY_INTERNAL_READERS[caseKey]
      : E2E_DISCOVERY_MESSAGE_READERS[caseKey];
  const deniedWriters = E2E_DISCOVERY_ACTORS.filter(
    actor =>
      !(readers as readonly string[]).includes(actor) ||
      actor === 'KS_BRANCH_MANAGER' ||
      actor === 'MK_BRANCH_MANAGER'
  );
  const createdAt = anchor
    ? {
        MEMBER_REQUEST: '2025-11-27T12:00:00.000Z',
        STAFF_REPLY: '2025-11-28T00:00:00.000Z',
        INTERNAL_NOTE: '2025-11-28T01:00:00.000Z',
        AGENT_REPLY: '2025-11-28T02:00:00.000Z',
      }[key]
    : {
        MEMBER_REQUEST: '2026-01-02T09:00:00.000Z',
        STAFF_REPLY: '2026-01-02T10:00:00.000Z',
        INTERNAL_NOTE: '2026-01-02T11:00:00.000Z',
        AGENT_REPLY: '2026-01-02T12:00:00.000Z',
      }[key];
  const memberReadAt = anchor ? '2025-11-27T13:00:00.000Z' : '2026-01-02T09:30:00.000Z';
  return {
    row: {
      id: legacy?.id ?? goldenId('discovery', 'message', caseKey, key),
      tenantId: claim.tenantId,
      claimId: claim.id,
      senderId: messageSender(caseKey, key),
      content: legacy?.content ?? `Plan070 ${caseKey}: ${key.toLowerCase().replaceAll('_', ' ')}`,
      isInternal: key === 'INTERNAL_NOTE',
      readAt: key === 'MEMBER_REQUEST' ? memberReadAt : null,
      createdAt,
    },
    access: discoveryAccessIntent(
      readers,
      key === 'INTERNAL_NOTE' ? 'send-internal-message' : 'send-public-message',
      deniedWriters
    ),
  };
}

function thread(key: CaseKey, agentAdmitted: boolean) {
  return {
    MEMBER_REQUEST: message(key, 'MEMBER_REQUEST'),
    STAFF_REPLY: message(key, 'STAFF_REPLY'),
    INTERNAL_NOTE: message(key, 'INTERNAL_NOTE'),
    ...(agentAdmitted ? { AGENT_REPLY: message(key, 'AGENT_REPLY') } : {}),
  };
}

/** Logical threads on claim_messages; no separate claim_threads row is required by this API. */
export const E2E_DISCOVERY_THREADS = {
  KS_ANCHOR: thread('KS_ANCHOR', true),
  KS_OTHER_MEMBER: thread('KS_OTHER_MEMBER', true),
  KS_PEER_STAFF: thread('KS_PEER_STAFF', true),
  KS_UNASSIGNED: thread('KS_UNASSIGNED', true),
  KS_OTHER_BRANCH: thread('KS_OTHER_BRANCH', false),
  MK_FOREIGN_TENANT: thread('MK_FOREIGN_TENANT', false),
} as const;

function notification(caseKey: CaseKey, recipient: E2EDiscoveryActor, isRead: boolean) {
  return {
    row: {
      id: goldenId('discovery', 'notification', caseKey, isRead ? 'read' : 'unread'),
      tenantId: E2E_CASE_FIXTURES[caseKey].tenantId,
      userId: E2E_USER_IDS[recipient],
      type: 'message',
      title: `Plan070 ${caseKey} message`,
      content: `A public reply is available for ${caseKey}.`,
      actionUrl: `/${recipient === 'KS_STAFF_UNASSIGNED' ? 'staff' : 'member'}/claims/${E2E_CASE_FIXTURES[caseKey].id}`,
      isRead,
      createdAt: caseKey === 'KS_ANCHOR' ? '2025-11-28T03:00:00.000Z' : '2026-01-02T13:00:00.000Z',
    },
    access: discoveryAccessIntent(
      [recipient],
      'mark-notification-read',
      E2E_DISCOVERY_ACTORS.filter(actor => actor !== recipient)
    ),
  };
}

function notificationPair(key: CaseKey, recipient: E2EDiscoveryActor) {
  return { READ: notification(key, recipient, true), UNREAD: notification(key, recipient, false) };
}

/** Notifications are private to their recipient; even a tenant admin cannot mark another's read. */
export const E2E_DISCOVERY_NOTIFICATIONS = {
  KS_ANCHOR: notificationPair('KS_ANCHOR', 'KS_MEMBER'),
  KS_OTHER_MEMBER: notificationPair('KS_OTHER_MEMBER', 'KS_MEMBER_A2'),
  KS_PEER_STAFF: notificationPair('KS_PEER_STAFF', 'KS_STAFF_UNASSIGNED'),
  KS_UNASSIGNED: notificationPair('KS_UNASSIGNED', 'KS_MEMBER'),
  KS_OTHER_BRANCH: notificationPair('KS_OTHER_BRANCH', 'KS_MEMBER_B1'),
  MK_FOREIGN_TENANT: notificationPair('MK_FOREIGN_TENANT', 'MK_MEMBER'),
} as const;
