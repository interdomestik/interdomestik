type Environment = Readonly<Record<string, string | undefined>>;

/** Remote databases (including production) require an exact credential-free target confirmation. */
export function resolvePilotBranchTarget(databaseUrl: string | undefined, target?: string) {
  if (!databaseUrl) throw new Error('DATABASE_URL required');
  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    throw new Error('Invalid database target');
  }
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    !/^[a-zA-Z0-9.-]+$/.test(url.hostname) ||
    !url.pathname.slice(1) ||
    !url.username ||
    url.search ||
    url.hash
  )
    throw new Error('Ambiguous database target');
  const host = url.hostname;
  const port = Number(url.port || 5432);
  const database = decodeURIComponent(url.pathname.slice(1));
  const expected = `${host}:${port}/${database}`;
  const local = ['localhost', '127.0.0.1'].includes(host);
  if ((!local || target !== undefined) && target !== expected) {
    throw new Error('Explicit --target host:port/database confirmation required');
  }
  return {
    host,
    port,
    database,
    username: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    ssl: local ? (false as const) : ('verify-full' as const),
  };
}

export function parsePilotBranchArgs(args: readonly string[], env: Environment) {
  const tenantIds: string[] = [];
  let target: string | undefined;
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    const value = args[++i];
    if (!value || value.startsWith('--'))
      throw new Error('Expected --tenant ID or --target host:port/database');
    if (flag === '--tenant' && /^[a-zA-Z0-9_-]+$/.test(value)) tenantIds.push(value);
    else if (flag === '--target' && target === undefined) target = value;
    else throw new Error('Invalid audit arguments');
  }
  if (!tenantIds.length) throw new Error('At least one explicit --tenant ID required');
  // Require confirmation even for loopback: a local tunnel may point at production.
  if (!target) throw new Error('An explicit --target host:port/database is required');
  return {
    tenantIds: [...new Set(tenantIds)],
    connection: resolvePilotBranchTarget(env.DATABASE_URL, target),
  };
}
