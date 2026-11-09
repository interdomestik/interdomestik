import type {
  sponsorMailOutbox,
  sponsorRosterEntries,
  sponsorTerms,
} from '@interdomestik/database';

import { type AttemptOutcome, providerSettlement } from '../sponsor-coverage/handover-evidence';
import { parseTimestamp } from '../sponsor-coverage/resolve';

const DAY_MS = 24 * 60 * 60 * 1000;
export type RetentionSummary = {
  processedTerms: number;
  purgedTerms: number;
  invalidatedTokens: number;
  erasedAddresses: number;
  erasedHmacs: number;
  skippedOutbox: number;
  deletedOutbox: number;
  purgedIntents: number;
};
type Term = Pick<
  typeof sponsorTerms.$inferSelect,
  'id' | 'sponsorId' | 'termEnd' | 'terminatedEffectiveAt'
>;
type Entry = Pick<
  typeof sponsorRosterEntries.$inferSelect,
  | 'id'
  | 'termId'
  | 'firstName'
  | 'lastName'
  | 'emailNormalized'
  | 'emailHmac'
  | 'optoutTokenHash'
  | 'revokedAt'
>;
type Mail = Pick<
  typeof sponsorMailOutbox.$inferSelect,
  'id' | 'rosterEntryId' | 'state' | 'terminalAt'
>;

export type RetentionRows = {
  term: Term;
  /** All terms of this sponsor, including unapproved and future terms. */
  sponsorTerms: readonly Pick<Term, 'id' | 'sponsorId' | 'termEnd'>[];
  entries: readonly Entry[];
  outbox: readonly Mail[];
};

export type RetentionPlan = {
  skipOutboxIds: string[];
  invalidateTokenIds: string[];
  eraseAddressIds: string[];
  eraseHmacIds: string[];
  purgeTerm: boolean;
};

/** Calendar months in UTC, clamped to the target month's last day; never mutates its input. */
export function addMonths(date: Date, months: number): Date {
  if (!Number.isFinite(date.getTime()) || !Number.isInteger(months)) {
    throw new TypeError('Invalid retention date or month count');
  }
  const result = new Date(date);
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(result);
  lastDay.setUTCMonth(lastDay.getUTCMonth() + 1, 0);
  result.setUTCDate(Math.min(day, lastDay.getUTCDate()));
  if (!Number.isFinite(result.getTime())) throw new Error('Invalid retention date');
  return result;
}

export function outboxRetentionCutoff(now: Date): Date {
  return new Date(addMonths(now, 0).getTime() - 30 * DAY_MS);
}

export function planOutboxDeletion(rows: readonly Mail[], now: Date): string[] {
  const cutoff = outboxRetentionCutoff(now);
  return rows
    .filter(
      row =>
        ['sent', 'skipped', 'failed'].includes(row.state) &&
        row.terminalAt !== null &&
        parseTimestamp(row.terminalAt) <= cutoff
    )
    .map(row => row.id);
}

function addressErased(entry: Entry): boolean {
  return entry.firstName === null && entry.lastName === null && entry.emailNormalized === null;
}

/** §3.8–3.9: all outcomes share one schedule; each array is applied in the declared order. */
export function planRetention(rows: RetentionRows, now: Date): RetentionPlan {
  if (!Number.isFinite(now.getTime())) throw new RangeError('Invalid retention clock');
  const { term } = rows;
  const termEnd = parseTimestamp(term.termEnd);
  const eraseDue = addMonths(termEnd, 12) <= now;
  const tokenDue =
    parseTimestamp(term.terminatedEffectiveAt ?? term.termEnd).getTime() + 30 * DAY_MS <=
    now.getTime();
  const terms = rows.sponsorTerms.filter(row => row.sponsorId === term.sponsorId);
  const lastEnd = terms.reduce(
    (last, row) => Math.max(last, parseTimestamp(row.termEnd).getTime()),
    termEnd.getTime()
  );
  const hmacDue = terms.some(row => row.id === term.id) && addMonths(new Date(lastEnd), 12) <= now;
  const entries = rows.entries.filter(row => row.termId === term.id);
  const entryIds = new Set(entries.map(row => row.id));
  const mail = rows.outbox.filter(
    row => row.rosterEntryId !== null && entryIds.has(row.rosterEntryId)
  );
  const invalidateTokenIds = entries
    .filter(row => row.optoutTokenHash !== null && (row.revokedAt !== null || tokenDue || eraseDue))
    .map(row => row.id);
  const eraseAddressIds = entries.filter(row => eraseDue && !addressErased(row)).map(row => row.id);
  const eraseHmacIds = entries
    .filter(
      row =>
        row.emailHmac !== null &&
        hmacDue &&
        (row.optoutTokenHash === null || invalidateTokenIds.includes(row.id)) &&
        (addressErased(row) || eraseAddressIds.includes(row.id))
    )
    .map(row => row.id);
  return {
    skipOutboxIds: mail
      .filter(row => eraseDue && ['queued', 'claimed'].includes(row.state))
      .map(row => row.id),
    invalidateTokenIds,
    eraseAddressIds,
    eraseHmacIds,
    // Surviving outbox FKs and not-yet-due HMACs defer the whole unit, never bypass a schedule.
    purgeTerm:
      addMonths(termEnd, 120) <= now &&
      mail.length === 0 &&
      entries.every(
        row =>
          (row.optoutTokenHash === null || invalidateTokenIds.includes(row.id)) &&
          (addressErased(row) || eraseAddressIds.includes(row.id)) &&
          (row.emailHmac === null || eraseHmacIds.includes(row.id))
      ),
  };
}

export function canPurgeHandover(input: {
  linkedEntries: number;
  intentOutboxRows: number;
  reconciliationClosedAt: string | null;
  attempts: readonly { outcome: AttemptOutcome }[];
}): boolean {
  return (
    input.linkedEntries === 0 &&
    input.intentOutboxRows === 0 &&
    input.reconciliationClosedAt !== null &&
    providerSettlement(input.attempts) !== 'unresolved'
  );
}
