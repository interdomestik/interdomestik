export interface ActionResult {
  success: boolean;
  error?: string;
  canAcknowledge?: boolean;
  messages?: { id: string; content: string }[];
}

interface TransportReply {
  status: number;
  contentType: string | null;
  body: string;
}

interface SessionCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires: number;
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'Strict' | 'Lax' | 'None';
}

const TRANSPORT_ERROR = 'Messaging fixture request failed; credential diagnostics suppressed';
const FLIGHT_ERROR = 'Invalid messaging Flight response';

/** Native transport errors are replaced before any Playwright instrumentation can see them. */
export async function sanitizeTransport<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch {
    throw new Error(TRANSPORT_ERROR);
  }
}

function jsonObject(body: string): Record<string, unknown> {
  const value: unknown = JSON.parse(body);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(FLIGHT_ERROR);
  return value as Record<string, unknown>;
}

function flightRecord(body: string, id: string): Record<string, unknown> {
  const prefix = `${id}:`;
  const rows = body.split(/\r?\n/).filter(line => line.startsWith(prefix));
  if (rows.length !== 1) throw new Error(FLIGHT_ERROR);
  // Error (E), binary/text and other tagged rows are unsupported, never action results.
  const payload = rows[0].slice(prefix.length);
  if (!payload.startsWith('{')) throw new Error(FLIGHT_ERROR);
  return jsonObject(payload);
}

/** Bounded resolver: only the unique root's promised action-result record is admissible. */
export function parseFlightResult(reply: TransportReply): ActionResult {
  try {
    const mediaType = reply.contentType?.split(';')[0].trim().toLowerCase();
    if (reply.status !== 200 || mediaType !== 'text/x-component') throw new Error(FLIGHT_ERROR);
    const root = flightRecord(reply.body, '0');
    const reference = typeof root.a === 'string' ? /^\$@([\da-f]+)$/.exec(root.a) : null;
    if (!reference || reference[1] === '0') throw new Error(FLIGHT_ERROR);
    const result = flightRecord(reply.body, reference[1]);
    if (typeof result.success !== 'boolean') throw new Error(FLIGHT_ERROR);
    return result as unknown as ActionResult;
  } catch {
    // JSON diagnostics may contain response data; do not retain the original error/cause.
    throw new Error(FLIGHT_ERROR);
  }
}

function cookieExpiry(attributes: Map<string, string>): number {
  const maxAge = attributes.get('max-age');
  if (maxAge !== undefined && /^-?\d+$/.test(maxAge)) {
    return Date.now() / 1000 + Number(maxAge);
  }
  const expires = attributes.get('expires');
  return expires ? Date.parse(expires) / 1000 : -1;
}

function parseCookie(header: string, url: URL): SessionCookie {
  const [pair, ...parts] = header.split(';');
  const separator = pair.indexOf('=');
  if (separator < 1) throw new Error(TRANSPORT_ERROR);
  const attributes = new Map(
    parts.map(part => {
      const [name, ...value] = part.trim().split('=');
      return [name.toLowerCase(), value.join('=')];
    })
  );
  const domain = attributes.get('domain') ?? url.hostname;
  const host = domain.replace(/^\./, '').toLowerCase();
  if (url.hostname !== host && !url.hostname.endsWith(`.${host}`)) throw new Error(TRANSPORT_ERROR);
  const sameSite = attributes.get('samesite')?.toLowerCase();
  let policy: SessionCookie['sameSite'] = 'Lax';
  if (sameSite === 'strict') policy = 'Strict';
  if (sameSite === 'none') policy = 'None';
  return {
    name: pair.slice(0, separator).trim(),
    value: pair.slice(separator + 1).trim(),
    domain,
    path: attributes.get('path') ?? (url.pathname.slice(0, url.pathname.lastIndexOf('/')) || '/'),
    expires: cookieExpiry(attributes),
    httpOnly: attributes.has('httponly'),
    secure: attributes.has('secure'),
    sameSite: policy,
  };
}

function cookieKey(cookie: SessionCookie): string {
  return `${cookie.domain}:${cookie.path}:${cookie.name}`;
}

/** One origin per actor. The jar never enters a report, attachment or assertion. */
export class MessagingSessionTransport {
  readonly #origin: string;
  readonly #headers: Record<string, string>;
  readonly #jar = new Map<string, SessionCookie>();

  constructor(origin: string, headers: Record<string, string> = {}) {
    this.#origin = new URL(origin).origin;
    this.#headers = { ...headers };
  }

  cookies(): SessionCookie[] {
    return [...this.#jar.values()]
      .filter(cookie => cookie.expires === -1 || cookie.expires > Date.now() / 1000)
      .map(cookie => ({ ...cookie }));
  }

  replaceCookies(cookies: readonly SessionCookie[]): void {
    this.#jar.clear();
    cookies.forEach(cookie => this.#jar.set(cookieKey(cookie), { ...cookie }));
  }

  request(
    path: string,
    options: { method?: string; headers?: Record<string, string>; body?: string } = {}
  ): Promise<TransportReply> {
    return sanitizeTransport(async () => {
      const url = new URL(path, this.#origin);
      if (url.origin !== this.#origin) throw new Error(TRANSPORT_ERROR);
      const headers = new Headers({ ...this.#headers, Origin: this.#origin, ...options.headers });
      const cookies = this.cookies().filter(cookie => {
        const pathMatches =
          url.pathname === cookie.path ||
          url.pathname.startsWith(`${cookie.path.replace(/\/$/, '')}/`);
        return pathMatches && (!cookie.secure || url.protocol === 'https:');
      });
      headers.delete('cookie');
      if (cookies.length)
        headers.set('cookie', cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; '));
      const response = await globalThis.fetch(url, {
        ...options,
        headers,
        redirect: 'manual',
        signal: AbortSignal.timeout(30_000),
      });
      const body = await response.text();
      response.headers.getSetCookie().forEach(header => {
        const cookie = parseCookie(header, url);
        this.#jar.set(cookieKey(cookie), cookie);
      });
      return { status: response.status, contentType: response.headers.get('content-type'), body };
    });
  }

  auth(path: string, data?: object): Promise<{ ok: boolean; userId: string | null }> {
    return sanitizeTransport(async () => {
      const reply = await this.request(`/api/auth/${path}`, {
        method: data === undefined ? 'GET' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: data === undefined ? undefined : JSON.stringify(data),
      });
      const value: unknown = JSON.parse(reply.body);
      let userId: string | null = null;
      if (value && typeof value === 'object' && 'user' in value) {
        const actor = value.user;
        if (actor && typeof actor === 'object' && 'id' in actor && typeof actor.id === 'string')
          userId = actor.id;
      }
      return { ok: reply.status >= 200 && reply.status < 300, userId };
    });
  }
}
