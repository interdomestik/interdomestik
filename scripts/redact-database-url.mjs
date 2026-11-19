#!/usr/bin/env node
// Reads a database URL on stdin and prints only its scheme, host, port and database name, for
// diagnostics that must never show credentials. User, password, query (which may carry
// `password=`) and any path that is not a plain database name are dropped. The URL arrives on
// stdin so it never appears in a process argv.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Only `postgres://` or `postgresql://` with an authority: a missing slash or another scheme can
// move credentials into the path.
const POSTGRES_AUTHORITY = /^postgres(?:ql)?:\/\/[^/]/iu;
const DATABASE_NAME = /^\/[\w-]*$/u;

/** Scheme, host, port and database name of a PostgreSQL URL; anything else is not described. */
export function describeDatabaseUrl(raw) {
  let url;
  try {
    url = new URL(raw.trim());
  } catch {
    return '(not a database URL)';
  }
  if (!POSTGRES_AUTHORITY.test(raw.trim()) || url.hostname === '') {
    return '(not a database URL)';
  }
  const port = url.port || '(no port)';
  const database = DATABASE_NAME.test(url.pathname) ? url.pathname : '/(unnamed)';
  return `${url.protocol}//${url.hostname}:${port}${database}`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  process.stdout.write(describeDatabaseUrl(readFileSync(0, 'utf8')));
}
