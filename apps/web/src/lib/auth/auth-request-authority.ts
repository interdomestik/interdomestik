import { createAuthMiddleware } from 'better-auth/api';

import {
  assertNoAuthorityFields,
  AUTHORITY_INTENT_KEY,
  CREATION_AUTHORITY_KEYS,
  invalidOnboardingError,
  recordValue,
  replaceRecordContents,
} from './authority-fields';
import { parseOnboardingSelector, resolveOnboardingAuthority } from './onboarding-authority';

type FindUserByEmail = (email: string) => Promise<unknown>;
type RequestAuthorityArgs = {
  path: string;
  body: unknown;
  headers: Headers;
  now?: number;
  findUserByEmail?: FindUserByEmail;
};

function issuedIntent(args: RequestAuthorityArgs) {
  const resolved = resolveOnboardingAuthority({
    headers: args.headers,
    body: args.body,
    now: args.now,
  });
  if (!resolved.ok) throw invalidOnboardingError();
  return resolved.intent;
}

function sanitizeWithIntent(body: unknown, intent: unknown): void {
  replaceRecordContents(body, CREATION_AUTHORITY_KEYS, { [AUTHORITY_INTENT_KEY]: intent });
}

function sanitizeSocial(body: unknown, intent?: unknown): void {
  const additions = intent ? { additionalData: { [AUTHORITY_INTENT_KEY]: intent } } : {};
  replaceRecordContents(body, CREATION_AUTHORITY_KEYS, additions);
}

export async function applyAuthRequestAuthority(args: RequestAuthorityArgs): Promise<void> {
  if (args.path === '/update-user') {
    assertNoAuthorityFields(args.body);
    return;
  }
  if (args.path === '/sign-up/email') {
    sanitizeWithIntent(args.body, issuedIntent(args));
    return;
  }
  if (args.path === '/sign-in/social') {
    const selector = parseOnboardingSelector(args.body);
    if (selector.kind === 'invalid') throw invalidOnboardingError();
    sanitizeSocial(args.body, selector.kind === 'valid' ? issuedIntent(args) : undefined);
    return;
  }
  if (args.path !== '/sign-in/email-otp') return;
  const selector = parseOnboardingSelector(args.body);
  if (selector.kind === 'invalid') throw invalidOnboardingError();
  if (selector.kind === 'valid') {
    sanitizeWithIntent(args.body, issuedIntent(args));
    return;
  }
  const body = recordValue(args.body);
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!email || !args.findUserByEmail || !(await args.findUserByEmail(email))) {
    throw invalidOnboardingError();
  }
  replaceRecordContents(args.body, CREATION_AUTHORITY_KEYS);
}

export const authRequestAuthority = createAuthMiddleware(async context => {
  const headers = context.headers ?? context.request?.headers ?? new Headers();
  await applyAuthRequestAuthority({
    path: context.path,
    body: context.body,
    headers,
    findUserByEmail: email => context.context.internalAdapter.findUserByEmail(email),
  });
});
