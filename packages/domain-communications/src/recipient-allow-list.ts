type Env = Readonly<NodeJS.Dict<string>>;

export type AllowListRefusal = 'allowlist_empty' | 'recipient_not_allowlisted';

const signal = (value: string | undefined) => value?.trim().toLowerCase() || undefined;

/**
 * Hosted staging must never mail a real inbox by accident, so every recipient must be on
 * EMAIL_RECIPIENT_ALLOWLIST there. Decided only from server-side deployment variables, failing
 * closed: any staging or preview signal (also when another signal says production), and any
 * hosted deployment that is not positively production, is gated. "Positively production" mirrors
 * isProductionEmailDeployment in apps/web/src/lib/email-link-origins.ts (not importable here,
 * R-15). Local development, CI and local E2E carry no hosted or staging signal and are unchanged.
 */
export function recipientAllowListActive(env: Env = process.env): boolean {
  const vercelEnv = signal(env.VERCEL_ENV);
  const targetEnv = signal(env.VERCEL_TARGET_ENV);
  const deployEnv = signal(env.INTERDOMESTIK_DEPLOY_ENV);
  const signals = [vercelEnv, targetEnv, deployEnv];
  if (signals.some(value => value === 'staging' || value === 'preview')) return true;
  const hosted = env.VERCEL === '1' || Boolean(env.VERCEL_URL?.trim()) || Boolean(vercelEnv);
  if (!hosted) return false;
  return !(vercelEnv === 'production' && (!targetEnv || targetEnv === 'production'));
}

// Matching is case-insensitive for the whole address. Local part: RFC 5322 dot-atom only (no
// quoted strings). Domain: DNS host name with at least two labels.
const LOCAL_PART = /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/;
const DOMAIN =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/** Lower-cased `local@domain` when the address is a plain dot-atom mailbox, otherwise null. */
function parseMailbox(value: string): { local: string; domain: string } | null {
  const lowered = value.trim().toLowerCase();
  const at = lowered.indexOf('@');
  if (at <= 0 || at !== lowered.lastIndexOf('@')) return null;
  const local = lowered.slice(0, at);
  const domain = lowered.slice(at + 1).replace(/\.$/, '');
  return LOCAL_PART.test(local) && local.length <= 64 && DOMAIN.test(domain)
    ? { local, domain }
    : null;
}

/** Valid entries only: `qa@example.test` (one mailbox) or `example.test` / `@example.test`. */
function readAllowList(env: Env) {
  const mailboxes = new Set<string>();
  const domains = new Set<string>();
  for (const raw of (env.EMAIL_RECIPIENT_ALLOWLIST ?? '').split(/[\s,]+/)) {
    const entry = raw.trim().toLowerCase();
    if (!entry) continue;
    const domain = (entry.startsWith('@') ? entry.slice(1) : entry).replace(/\.$/, '');
    if (!entry.slice(1).includes('@') && DOMAIN.test(domain)) {
      domains.add(domain);
      continue;
    }
    const mailbox = parseMailbox(entry);
    if (mailbox) mailboxes.add(`${mailbox.local}@${mailbox.domain}`);
  }
  return { mailboxes, domains };
}

/** Null when the mailbox may be sent to; otherwise the refusal reason. */
export function allowListRefusal(mailbox: string, env: Env = process.env): AllowListRefusal | null {
  if (!recipientAllowListActive(env)) return null;
  const { mailboxes, domains } = readAllowList(env);
  if (mailboxes.size === 0 && domains.size === 0) return 'allowlist_empty';
  const parsed = parseMailbox(mailbox);
  if (!parsed) return 'recipient_not_allowlisted';
  return mailboxes.has(`${parsed.local}@${parsed.domain}`) || domains.has(parsed.domain)
    ? null
    : 'recipient_not_allowlisted';
}

/** Content-free record of a refused recipient: the reason only, never the address. */
export function recordAllowListRefusal(reason: AllowListRefusal): void {
  console.warn('[EmailAllowList]', { outcome: 'refused', reason });
}
