type Env = Readonly<NodeJS.Dict<string>>;

export type AllowListRefusal =
  'allowlist_empty' | 'recipient_not_allowlisted' | 'deploy_env_unknown';
export type RecipientPolicy = 'open' | 'allowlist' | 'refuse_all';

const LOCAL_DEPLOY_ENVS: ReadonlySet<string> = new Set(['local', 'development', 'production']);

/**
 * Which recipients a process may mail, decided only from server-side variables. A hosted (Vercel)
 * runtime is keyed on INTERDOMESTIK_DEPLOY_ENV, a project setting of each Vercel project:
 * `production` sends as before, `staging` sends only to EMAIL_RECIPIENT_ALLOWLIST, and an unset
 * or unknown value refuses every send (fail closed). Off Vercel, `staging` (the Docker staging
 * image) is gated the same way, any other unrecognised value refuses every send, and local
 * development, CI and local E2E (unset, local, development) keep their current behaviour.
 */
export function recipientPolicy(env: Env = process.env): RecipientPolicy {
  const deployEnv = env.INTERDOMESTIK_DEPLOY_ENV?.trim().toLowerCase();
  if (deployEnv === 'staging') return 'allowlist';
  const hosted = [env.VERCEL, env.VERCEL_URL, env.VERCEL_ENV, env.VERCEL_TARGET_ENV].some(value =>
    value?.trim()
  );
  if (hosted) return deployEnv === 'production' ? 'open' : 'refuse_all';
  return !deployEnv || LOCAL_DEPLOY_ENVS.has(deployEnv) ? 'open' : 'refuse_all';
}

export const recipientAllowListActive = (env: Env = process.env) => recipientPolicy(env) !== 'open';

// ASCII only, validated before case folding (toLowerCase maps some non-ASCII letters, such as
// the Kelvin sign, onto ASCII). Local part: RFC 5322 dot-atom (no quoted strings). Domain: DNS
// host name with at least two labels. Matching is then case-insensitive for the whole address.
const ATOM = "[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+";
const LOCAL_PART = new RegExp(`^${ATOM}(?:\\.${ATOM})*$`);
const LABEL = '[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?';
const DOMAIN = new RegExp(`^(?=.{1,253}$)(?:${LABEL}\\.)+${LABEL}$`);
const asDomain = (value: string) => {
  const domain = value.trim().replace(/\.$/, '');
  return DOMAIN.test(domain) ? domain.toLowerCase() : null;
};

/** Lower-cased `local@domain` when the address is a plain ASCII dot-atom mailbox, otherwise null. */
function parseMailbox(value: string): { local: string; domain: string } | null {
  const trimmed = value.trim();
  const at = trimmed.indexOf('@');
  if (at <= 0 || at !== trimmed.lastIndexOf('@')) return null;
  const local = trimmed.slice(0, at);
  const domain = asDomain(trimmed.slice(at + 1));
  return domain && local.length <= 64 && LOCAL_PART.test(local)
    ? { local: local.toLowerCase(), domain }
    : null;
}

/** Valid entries only: `qa@example.test` (one mailbox) or `example.test` / `@example.test`. */
function readAllowList(env: Env) {
  const mailboxes = new Set<string>();
  const domains = new Set<string>();
  for (const raw of (env.EMAIL_RECIPIENT_ALLOWLIST ?? '').split(/[\s,]+/)) {
    const entry = raw.trim();
    if (!entry) continue;
    const bare = entry.startsWith('@') ? entry.slice(1) : entry;
    const domain = bare.includes('@') ? null : asDomain(bare);
    if (domain) {
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
  const policy = recipientPolicy(env);
  if (policy === 'open') return null;
  if (policy === 'refuse_all') return 'deploy_env_unknown';
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
