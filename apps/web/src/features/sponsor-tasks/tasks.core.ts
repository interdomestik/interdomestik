import 'server-only';

import {
  recordHandoverEvidence,
  closeHandoverByStaff,
} from '@interdomestik/domain-membership-billing/sponsors/handover-staff';
import { createHandoverPaddleClient } from '@interdomestik/domain-membership-billing/sponsors/paddle-handover-client';
import { sponsorCredentialCheck } from '@interdomestik/domain-membership-billing/sponsors/sponsor-jobs';
import {
  acknowledgeHandoverCharge,
  listSponsorStaffTasks,
  type SponsorStaffTask,
} from '@interdomestik/domain-membership-billing/sponsors/staff-tasks';
import { z } from 'zod';
import { authorizeSponsorTasks } from './access.core';

export type TaskError = 'forbidden' | 'invalid' | 'not_found' | 'conflict' | 'error';
export type TaskActionResult = { ok: true } | { ok: false; error: TaskError };
export type TaskListResult =
  { ok: true; tasks: SponsorStaffTask[] } | { ok: false; error: TaskError };

const identifier = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9_-]+$/u);
const actionSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('evidence'),
    intentId: identifier,
    paidUntil: z.iso.datetime({ offset: true }),
    evidenceId: z
      .string()
      .trim()
      .regex(/^(txn|adj)_[A-Za-z0-9]{1,116}$/u)
      .max(120),
  }),
  z.object({
    kind: z.literal('close'),
    intentId: identifier,
    disposition: z.enum(['canceled', 'renewing_as_member']),
  }),
  z.object({ kind: z.literal('acknowledge'), chargeId: identifier }),
]);

export async function loadSponsorTasks(): Promise<TaskListResult> {
  const context = await authorizeSponsorTasks();
  if (!context) return { ok: false, error: 'forbidden' };
  try {
    const { authority, actor } = context;
    const result = await listSponsorStaffTasks(
      authority,
      actor,
      { hasCredential: sponsorCredentialCheck(authority) },
      new Date()
    );
    return result.ok ? { ok: true, tasks: result.value } : result;
  } catch {
    return { ok: false, error: 'error' };
  }
}

export async function runSponsorTaskAction(input: unknown): Promise<TaskActionResult> {
  const context = await authorizeSponsorTasks();
  if (!context) return { ok: false, error: 'forbidden' };
  const parsed = actionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalid' };
  const { authority, actor, tenantId } = context;
  const now = new Date();
  try {
    const data = parsed.data;
    if (data.kind === 'evidence') {
      const result = await recordHandoverEvidence(
        authority,
        actor,
        { hasCredential: sponsorCredentialCheck(authority) },
        {
          intentId: data.intentId,
          paidUntil: new Date(data.paidUntil),
          evidenceId: data.evidenceId,
          now,
        }
      );
      return result.ok ? { ok: true } : result;
    }
    if (data.kind === 'close') {
      const result = await closeHandoverByStaff(
        authority,
        actor,
        createHandoverPaddleClient(tenantId),
        {
          intentId: data.intentId,
          disposition: data.disposition,
          now,
        }
      );
      return result.ok ? { ok: true } : result;
    }
    const result = await acknowledgeHandoverCharge(authority, actor, {
      chargeId: data.chargeId,
      now,
    });
    return result.ok ? { ok: true } : result;
  } catch {
    return { ok: false, error: 'error' };
  }
}
