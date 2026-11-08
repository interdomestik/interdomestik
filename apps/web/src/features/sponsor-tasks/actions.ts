'use server';

import { runSponsorTaskAction, type TaskActionResult } from './tasks.core';

function field(form: unknown, name: string): FormDataEntryValue | null {
  return form instanceof FormData ? form.get(name) : null;
}

export async function recordEvidenceAction(form: unknown): Promise<TaskActionResult> {
  return runSponsorTaskAction({
    kind: 'evidence',
    intentId: field(form, 'intentId'),
    paidUntil: field(form, 'paidUntil'),
    evidenceId: field(form, 'evidenceId'),
  });
}

export async function closeHandoverAction(form: unknown): Promise<TaskActionResult> {
  return runSponsorTaskAction({
    kind: 'close',
    intentId: field(form, 'intentId'),
    disposition: field(form, 'disposition'),
  });
}

export async function acknowledgeChargeAction(form: unknown): Promise<TaskActionResult> {
  return runSponsorTaskAction({ kind: 'acknowledge', chargeId: field(form, 'chargeId') });
}
