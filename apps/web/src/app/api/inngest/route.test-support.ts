import { createHmac } from 'node:crypto';
import { headerKeys } from 'inngest';
import { NextRequest } from 'next/server';
import { expect } from 'vitest';

export const primary = '01'.repeat(32);
export const fallback = '02'.repeat(32);
export const unrelated = '03'.repeat(32);
export const callbackUrl = 'https://release-candidate.example.test/api/inngest';
const registrationBody = JSON.stringify({ url: callbackUrl });
const notificationFunctionId = 'interdomestik-web-notification-deliveries';
const notificationCron = '*/5 * * * *';
const extractionFunctions = [
  ['interdomestik-web-policy-extraction-requested', 'policy/extract.requested'],
  ['interdomestik-web-claim-intake-extraction-requested', 'claim/intake-extract.requested', 1],
  ['interdomestik-web-legal-document-extraction-requested', 'legal/extract.requested', 1],
] as const;
export const signingFlows = [
  ['primary', primary, undefined],
  ['fallback', fallback, undefined],
  ['fallback under forced streaming', fallback, 'force'],
] as const;

function signature(body: string, key: string, timestamp = String(Math.floor(Date.now() / 1000))) {
  const digest = createHmac('sha256', key).update(body).update(timestamp).digest('hex');
  return `t=${timestamp}&s=${digest}`;
}

export function request(
  method: 'GET' | 'POST' | 'PUT',
  options: {
    key?: string;
    timestamp?: string;
    syncKind?: string;
    execution?: 'extraction' | 'notifications';
    runId?: string;
  } = {}
) {
  const [policyFunctionId, policyEventName] = extractionFunctions[0];
  const notification = options.execution === 'notifications';
  const functionId = notification ? notificationFunctionId : policyFunctionId;
  const event = notification
    ? { data: { cron: notificationCron }, id: 'notification-tick', name: 'inngest/scheduled.timer' }
    : { data: { runId: 'policy-test', tenantId: 'synthetic-tenant' }, name: policyEventName };
  // The provider signs canonical JSON. Fixture keys are in canonical order.
  const executionBody = JSON.stringify({
    ctx: {
      attempt: 0,
      run_id: options.runId ?? 'run-test',
      stack: { current: 0, stack: [] },
      use_api: false,
    },
    event,
    events: [],
    steps: {},
    version: 1,
  });
  const body = method === 'PUT' ? registrationBody : method === 'POST' ? executionBody : undefined;
  const headers = new Headers({ 'Content-Type': 'application/json' });
  if (options.key) {
    headers.set(headerKeys.Signature, signature(body ?? '', options.key, options.timestamp));
  }
  if (options.syncKind) headers.set(headerKeys.InngestSyncKind, options.syncKind);

  return new NextRequest(method === 'POST' ? `${callbackUrl}?fnId=${functionId}` : callbackUrl, {
    method,
    headers,
    body,
  });
}

export const expectedFunctions = [
  { id: notificationFunctionId, trigger: { cron: notificationCron }, attempts: undefined },
  ...extractionFunctions.map(([id, event, attempts]) => ({ id, trigger: { event }, attempts })),
].map(({ id, trigger, attempts }) => ({
  id,
  name: id.slice('interdomestik-web-'.length),
  triggers: [trigger],
  steps: {
    step: {
      id: 'step',
      name: 'step',
      runtime: { type: 'http', url: `${callbackUrl}?fnId=${id}&stepId=step` },
      ...(attempts === undefined ? {} : { retries: { attempts } }),
    },
  },
}));

export async function signedResponseBody(response: Response, key: string) {
  const body = await response.text();
  const responseSignature = response.headers.get(headerKeys.Signature);
  expect(responseSignature).toBeTruthy();
  const timestamp = new URLSearchParams(responseSignature ?? '').get('t');
  expect(timestamp).toBeTruthy();
  expect(responseSignature === signature(body, key, timestamp ?? '')).toBe(true);
  const parsed: unknown = JSON.parse(body);
  return parsed;
}
