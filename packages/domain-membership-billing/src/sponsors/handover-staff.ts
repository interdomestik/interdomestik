import {
  and,
  eq,
  inArray,
  isNull,
  sponsorHandoverIntents,
  sponsorRosterEntries,
  type TenantTransaction,
} from '@interdomestik/database';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';

import { produceEntryStarts } from '../sponsor-coverage/entry-start';
import { type CoverageEntry, entryEnd, isEligible } from '../sponsor-coverage/evaluate';
import { canManageHandover, type SponsorActor } from './access';
import { type SponsorAuditEvent, writeSponsorAudit } from './audit';
import { readHandoverState } from './handover-intent-read';
import { lockPerson } from './handover-worker';
import type { HandoverPaddleClient, HandoverSubscription } from './paddle-handover-client';
import type { SponsorResult } from './terms';

/**
 * ACQ-3b §3.7 staff actions on a handover intent (§3.4: staff only). Both run under the worker's
 * person locks and take the intent `FOR UPDATE`, so they never race the worker or a revocation.
 */
const EVIDENCE_ID = /^[A-Za-z0-9._:-]{3,120}$/u;
const OPEN_STATES: ReadonlySet<string> = new Set(['pending', 'cancel_scheduled', 'staff_review']);
const UNIQUE_VIOLATION = '23505';

export type StaffDisposition = 'canceled' | 'renewing_as_member';

const later = (a: Date, b: Date): Date => (a.getTime() >= b.getTime() ? a : b);
const actorOf = (actor: SponsorActor) => ({ actorId: actor.userId, actorRole: actor.role });

async function intentOwner(
  tx: TenantTransaction,
  tenantId: string,
  intentId: string
): Promise<{ userId: string; providerSubscriptionId: string } | null> {
  const [row] = await tx
    .select({
      userId: sponsorHandoverIntents.userId,
      providerSubscriptionId: sponsorHandoverIntents.providerSubscriptionId,
    })
    .from(sponsorHandoverIntents)
    .where(
      and(eq(sponsorHandoverIntents.tenantId, tenantId), eq(sponsorHandoverIntents.id, intentId))
    );
  return row ?? null;
}

/** Linked entries a paid end can start: eligible, or held only for the Paddle state. */
async function startableEntries(
  tx: TenantTransaction,
  tenantId: string,
  intentId: string,
  linked: readonly CoverageEntry[]
): Promise<CoverageEntry[]> {
  const held = await tx
    .select({ id: sponsorRosterEntries.id })
    .from(sponsorRosterEntries)
    .where(
      and(
        eq(sponsorRosterEntries.tenantId, tenantId),
        eq(sponsorRosterEntries.handoverIntentId, intentId),
        eq(sponsorRosterEntries.outcome, 'staff_review'),
        eq(sponsorRosterEntries.reviewReason, 'paddle_state')
      )
    );
  const paddleHeld = new Set(held.map(row => row.id));
  return linked.filter(
    entry =>
      entry.startsAt === null &&
      isEligible(paddleHeld.has(entry.id) ? { ...entry, outcome: 'awaiting_paid_end' } : entry)
  );
}

/**
 * Staff record `paid_until` once, with a unique staff evidence id, after cancelling in Paddle
 * themselves (§3.7 step 3). The watch continues; linked entries start at max(term_start, paid_until).
 */
export async function recordHandoverEvidence(
  authority: TenantAuthority,
  actor: SponsorActor,
  deps: { hasCredential: (userId: string) => Promise<boolean> },
  input: { intentId: string; paidUntil: Date; evidenceId: string; now: Date }
): Promise<SponsorResult<{ started: number }>> {
  if (!canManageHandover(actor)) return { ok: false, error: 'forbidden' };
  const evidenceId = input.evidenceId.trim();
  if (!EVIDENCE_ID.test(evidenceId) || !Number.isFinite(input.paidUntil.getTime())) {
    return { ok: false, error: 'invalid' };
  }
  const { tenantId } = readTenantAuthority(authority);
  try {
    return await withTenantAuthority(authority, async tx => {
      const owner = await intentOwner(tx, tenantId, input.intentId);
      if (!owner) return { ok: false, error: 'not_found' } as const;
      await lockPerson(tx, tenantId, owner.userId);
      const state = await readHandoverState(tx, tenantId, input.intentId, { lock: true });
      if (!state) return { ok: false, error: 'not_found' } as const;
      const { intent } = state;
      if (intent.paidUntil || !OPEN_STATES.has(intent.state)) {
        return { ok: false, error: 'conflict' } as const;
      }
      const recorded = `staff:${evidenceId}`;
      const paidUntil = input.paidUntil.toISOString();
      await tx
        .update(sponsorHandoverIntents)
        .set({
          paidUntil,
          paidUntilEvidence: recorded,
          state: 'cancel_scheduled',
          nextAttemptAt: input.now.toISOString(),
          updatedAt: input.now.toISOString(),
        })
        .where(
          and(
            eq(sponsorHandoverIntents.tenantId, tenantId),
            eq(sponsorHandoverIntents.id, intent.id),
            isNull(sponsorHandoverIntents.paidUntil)
          )
        );
      const startable = await startableEntries(tx, tenantId, intent.id, state.linked);
      const starts = startable.map(entry => ({
        entryId: entry.id,
        interval: { start: later(entry.termStart, input.paidUntil), end: entryEnd(entry) },
      }));
      if (starts.length > 0) {
        await produceEntryStarts(tx, {
          tenantId,
          starts,
          handover: true,
          hasCredential: await deps.hasCredential(intent.userId),
        });
      }
      await writeSponsorAudit(tx, tenantId, [
        {
          action: 'sponsor_intent.state',
          entityType: 'sponsor_handover_intent',
          entityId: intent.id,
          ...actorOf(actor),
          metadata: {
            previousState: intent.state,
            state: 'cancel_scheduled',
            evidenceId: recorded,
          },
        },
      ]);
      return { ok: true, value: { started: starts.length } } as const;
    });
  } catch (error) {
    if ((error as { code?: string }).code === UNIQUE_VIOLATION)
      return { ok: false, error: 'conflict' };
    throw error;
  }
}

/** The staff read-back each disposition needs (§3.7 step 7); anything else keeps monitoring. */
export function readBackAllowsClosure(
  disposition: StaffDisposition,
  readBack: HandoverSubscription
): boolean {
  if (disposition === 'canceled') return readBack.status === 'canceled';
  return readBack.status === 'active' && readBack.scheduledChange === null;
}

/**
 * Administrative closure (`closed_by_staff`). It ends the operational task only: provider
 * settlement and charge reconciliation continue. `renewing_as_member` revokes every linked entry
 * that is not yet revoked, durably, and records the restoration cutoff.
 */
export async function closeHandoverByStaff(
  authority: TenantAuthority,
  actor: SponsorActor,
  client: Pick<HandoverPaddleClient, 'getSubscription'>,
  input: { intentId: string; disposition: StaffDisposition; now: Date }
): Promise<SponsorResult<{ revoked: number }>> {
  if (!canManageHandover(actor)) return { ok: false, error: 'forbidden' };
  const { tenantId } = readTenantAuthority(authority);
  const owner = await withTenantAuthority(authority, tx =>
    intentOwner(tx, tenantId, input.intentId)
  );
  if (!owner) return { ok: false, error: 'not_found' };
  const readBack = await client.getSubscription(owner.providerSubscriptionId);
  if (!readBackAllowsClosure(input.disposition, readBack)) return { ok: false, error: 'conflict' };
  const now = input.now.toISOString();
  return withTenantAuthority(authority, async tx => {
    await lockPerson(tx, tenantId, owner.userId);
    const state = await readHandoverState(tx, tenantId, input.intentId, { lock: true });
    if (!state) return { ok: false, error: 'not_found' } as const;
    if (!OPEN_STATES.has(state.intent.state)) return { ok: false, error: 'conflict' } as const;
    const renewing = input.disposition === 'renewing_as_member';
    const evidenceId = `readback:${readBack.status}:${now}`;
    await tx
      .update(sponsorHandoverIntents)
      .set({
        state: 'closed_by_staff',
        staffDisposition: input.disposition,
        staffEvidenceId: evidenceId,
        ...(renewing ? { restorationCutoff: now } : {}),
        updatedAt: now,
      })
      .where(
        and(
          eq(sponsorHandoverIntents.tenantId, tenantId),
          eq(sponsorHandoverIntents.id, state.intent.id)
        )
      );
    const revokeIds = renewing
      ? state.linked.filter(entry => entry.revokedAt === null).map(entry => entry.id)
      : [];
    if (revokeIds.length > 0) {
      await tx
        .update(sponsorRosterEntries)
        .set({ revokedAt: now, revokedReason: 'staff', optoutTokenHash: null })
        .where(
          and(
            eq(sponsorRosterEntries.tenantId, tenantId),
            inArray(sponsorRosterEntries.id, revokeIds),
            isNull(sponsorRosterEntries.revokedAt)
          )
        );
    }
    const events: SponsorAuditEvent[] = [
      {
        action: 'sponsor_intent.state',
        entityType: 'sponsor_handover_intent',
        entityId: state.intent.id,
        ...actorOf(actor),
        metadata: {
          previousState: state.intent.state,
          state: 'closed_by_staff',
          disposition: input.disposition,
          evidenceId,
        },
      },
      ...revokeIds.map((entryId): SponsorAuditEvent => ({
        action: 'sponsor_entry.revoked',
        entityType: 'sponsor_roster_entry',
        entityId: entryId,
        ...actorOf(actor),
        metadata: { reason: 'staff', intentId: state.intent.id },
      })),
    ];
    await writeSponsorAudit(tx, tenantId, events);
    return { ok: true, value: { revoked: revokeIds.length } } as const;
  });
}
