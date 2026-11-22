'use server';

import { headers } from 'next/headers';

import {
  readBusinessMembershipLeadForm,
  submitBusinessMembershipLeadCore,
  type SubmitBusinessMembershipLeadResult,
} from './business-membership-lead-internal';

export type { SubmitBusinessMembershipLeadResult } from './business-membership-lead-internal';

export async function submitBusinessMembershipLead(
  _prevState: SubmitBusinessMembershipLeadResult | null,
  formData: FormData
): Promise<SubmitBusinessMembershipLeadResult> {
  return submitBusinessMembershipLeadCore({
    requestHeaders: await headers(),
    readInput: () => readBusinessMembershipLeadForm(formData),
  });
}
