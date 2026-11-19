#!/usr/bin/env node
// Reads a database URL on stdin and prints only its scheme, host, port and database name, for
// diagnostics that must never show credentials. User, password and query (which may carry
// `password=`) are dropped. The URL arrives on stdin so it never appears in a process argv.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export function describeDatabaseUrl(raw) {
  let url;
  try {
    url = new URL(raw.trim());
  } catch {
    return '(not a URL)';
  }
  const port = url.port || '(no port)';
  return `${url.protocol}//${url.hostname}:${port}${url.pathname}`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  process.stdout.write(describeDatabaseUrl(readFileSync(0, 'utf8')));
}
