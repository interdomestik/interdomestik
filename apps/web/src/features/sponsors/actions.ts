'use server';

import { revalidatePath } from 'next/cache';
import { sponsorContext } from './context.core';
import { runSponsorAction, type SponsorActionResult } from './actions.core';
import type { SponsorOperation } from './input.core';

export async function sponsorAction(
  operation: SponsorOperation,
  _previous: SponsorActionResult | null,
  form: FormData
): Promise<SponsorActionResult> {
  try {
    const result = await runSponsorAction(await sponsorContext(), operation, form);
    if (result.ok) {
      revalidatePath('/[locale]/(agent)/agent/sponsors', 'layout');
      revalidatePath('/[locale]/admin/sponsors', 'layout');
      revalidatePath('/[locale]/(staff)/staff/sponsors', 'layout');
    }
    return result;
  } catch {
    return { ok: false, error: 'unavailable' };
  }
}
