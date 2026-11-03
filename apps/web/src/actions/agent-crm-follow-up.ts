'use server';

import { authorizeSessionTenant } from '@/lib/tenant-authority.server';
import { headers } from 'next/headers';

import {
  completeAgentLeadFollowUpCore,
  scheduleAgentLeadFollowUpCore,
} from './agent-crm-follow-up.core';

function getString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === 'string' ? value : '';
}

export async function scheduleAgentLeadFollowUp(formData: FormData) {
  const requestHeaders = await headers();
  const authorized = await authorizeSessionTenant(requestHeaders);

  await scheduleAgentLeadFollowUpCore({
    description: getString(formData, 'description') || null,
    leadId: getString(formData, 'leadId'),
    requestHeaders,
    scheduledAt: getString(formData, 'scheduledAt'),
    session: authorized?.session ?? null,
    authority: authorized?.authority ?? null,
    subject: getString(formData, 'subject') || 'Follow up',
  });
}

export async function completeAgentLeadFollowUp(formData: FormData) {
  const requestHeaders = await headers();
  const authorized = await authorizeSessionTenant(requestHeaders);

  await completeAgentLeadFollowUpCore({
    activityId: getString(formData, 'activityId'),
    expectedLifecycleVersion: getString(formData, 'expectedLifecycleVersion') || null,
    leadId: getString(formData, 'leadId'),
    requestHeaders,
    session: authorized?.session ?? null,
    authority: authorized?.authority ?? null,
    source: getString(formData, 'source') || null,
  });
}
