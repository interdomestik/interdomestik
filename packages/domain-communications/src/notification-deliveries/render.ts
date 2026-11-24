import type { TenantTransaction } from '@interdomestik/database';
import { CLAIM_STATUSES } from '@interdomestik/database/constants';
import { claims, claimMessages, user } from '@interdomestik/database/schema';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { CLAIM_MAIL_COPY } from '../claim-mail';
import { renderClaimMail } from '../claim-mail/render';
import type { ClaimMailLocale } from '../claim-mail/types';
import type { ClaimedDelivery } from './types';

const statusFacts = z.strictObject({
  fromStatus: z.enum(CLAIM_STATUSES),
  toStatus: z.enum(CLAIM_STATUSES),
});
const decisionFacts = z.strictObject({ decision: z.enum(['accepted', 'declined']) });
const messageFacts = z.strictObject({ previewRestricted: z.boolean() });
const noFacts = z.strictObject({});
const deliveryFacts = {
  claim_submitted: noFacts,
  claim_status_changed: statusFacts,
  claim_recovery_decision: decisionFacts,
  claim_message_to_member: messageFacts,
  staff_claim_submitted: noFacts,
  staff_member_message: noFacts,
} satisfies Record<ClaimedDelivery['kind'], z.ZodType>;
type DeliveryFacts = z.output<(typeof deliveryFacts)[ClaimedDelivery['kind']]>;

/**
 * Parses a delivery's stored `facts` for its kind. It throws on a malformed value; the runner
 * records that as the delivery's `facts_unavailable` failure and calls no provider.
 */
export function parseDeliveryFacts(
  kind: 'claim_status_changed',
  facts: unknown
): z.output<typeof statusFacts>;
export function parseDeliveryFacts(
  kind: 'claim_recovery_decision',
  facts: unknown
): z.output<typeof decisionFacts>;
export function parseDeliveryFacts(kind: ClaimedDelivery['kind'], facts: unknown): DeliveryFacts;
export function parseDeliveryFacts(kind: ClaimedDelivery['kind'], facts: unknown): DeliveryFacts {
  return deliveryFacts[kind].parse(facts);
}

export async function renderDelivery(
  tx: TenantTransaction,
  row: ClaimedDelivery,
  locale: ClaimMailLocale,
  baseUrl: string,
  category: string,
  claimNumber: string | null,
  previewRestricted: boolean
) {
  const { kind, claimId } = row;
  const link = { baseUrl, claimId };
  if (kind === 'staff_claim_submitted' || kind === 'staff_member_message') {
    return renderClaimMail(kind, locale, {
      ...link,
      category,
      claimNumber: claimNumber ?? CLAIM_MAIL_COPY[locale].claimWithoutNumber,
    });
  }

  if (kind === 'claim_message_to_member' && previewRestricted) {
    return renderClaimMail(kind, locale, { ...link, previewRestricted: true });
  }

  const facts = { ...link, claimTitle: await getClaimTitle(tx, row) };
  switch (kind) {
    case 'claim_submitted':
      return renderClaimMail(kind, locale, { ...facts, category });
    case 'claim_status_changed':
      return renderClaimMail(kind, locale, { ...facts, ...parseDeliveryFacts(kind, row.facts) });
    case 'claim_recovery_decision':
      return renderClaimMail(kind, locale, { ...facts, ...parseDeliveryFacts(kind, row.facts) });
    case 'claim_message_to_member': {
      const message = await getMessagePreview(tx, row, CLAIM_MAIL_COPY[locale].genericSender);
      return renderClaimMail(kind, locale, {
        ...facts,
        ...message,
        previewRestricted: false,
      });
    }
  }
}

async function getClaimTitle(tx: TenantTransaction, { tenantId, claimId }: ClaimedDelivery) {
  const [claim] = await tx
    .select({ title: claims.title })
    .from(claims)
    .where(and(eq(claims.tenantId, tenantId), eq(claims.id, claimId)));
  if (!claim) throw new Error('Delivery claim title is unavailable');
  return claim.title;
}

async function getMessagePreview(
  tx: TenantTransaction,
  { tenantId, claimId, subjectMessageId }: ClaimedDelivery,
  genericSender: string
) {
  if (!subjectMessageId) throw new Error('Delivery source message is unavailable');
  const [message] = await tx
    .select({ senderName: user.name, excerpt: claimMessages.content })
    .from(claimMessages)
    .leftJoin(user, and(eq(user.tenantId, tenantId), eq(user.id, claimMessages.senderId)))
    .where(
      and(
        eq(claimMessages.tenantId, tenantId),
        eq(claimMessages.claimId, claimId),
        eq(claimMessages.id, subjectMessageId),
        eq(claimMessages.isInternal, false)
      )
    );
  if (!message) throw new Error('Delivery source preview is unavailable');
  return { senderName: message.senderName || genericSender, excerpt: message.excerpt };
}

export async function renderDeliveryPush(
  tx: TenantTransaction,
  row: ClaimedDelivery,
  locale: ClaimMailLocale,
  previewRestricted: boolean
) {
  const copy = CLAIM_MAIL_COPY[locale];
  const url = `/${locale}/member/claims/${encodeURIComponent(row.claimId)}`;
  if (row.kind === 'claim_message_to_member') {
    const messages = copy.messages.claim_message_to_member;
    if (previewRestricted) {
      return { title: messages.restricted.heading, body: messages.restricted.body, url };
    }
    const { senderName, excerpt } = await getMessagePreview(tx, row, copy.genericSender);
    return { title: messages.full.heading, body: `${senderName}: ${excerpt.slice(0, 100)}`, url };
  }

  const { fromStatus, toStatus } = parseDeliveryFacts('claim_status_changed', row.facts);
  const title = await getClaimTitle(tx, row);
  return {
    title: copy.pushStatusHeading,
    body: `${title}: ${copy.statuses[fromStatus]} → ${copy.statuses[toStatus]}`,
    url,
  };
}
