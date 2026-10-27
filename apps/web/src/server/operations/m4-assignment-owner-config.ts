import fs from 'node:fs';
import type { M4AssignmentOwnerConfiguration } from './m4-assignment-owner';
function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error('Missing private assignment owner startup configuration');
  return value;
}
function number(name: string): number {
  const value = Number(required(name));
  if (!Number.isSafeInteger(value) || value < 1 || value > 2147483647)
    throw new Error('Invalid private assignment owner startup bound');
  return value;
}
function pem(name: string, secret = false): string {
  const file = required(name);
  const stat = fs.lstatSync(file);
  if (
    (secret && (stat.mode & 0o077 || stat.uid !== process.getuid?.())) ||
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    stat.size > 65536 ||
    fs.realpathSync(file) !== file
  )
    throw new Error('Private assignment TLS file refused');
  return fs.readFileSync(file, 'utf8');
}
// Only the separately launched owner reads these secrets. The SDK has no DB credential fields.
export function readM4AssignmentOwnerConfiguration(): M4AssignmentOwnerConfiguration {
  return Object.freeze({
    host: '127.0.0.1',
    port: number('M4_ASSIGNMENT_PORT'),
    relayDeadlineMs: number('M4_ASSIGNMENT_RELAY_DEADLINE_MS'),
    tls: Object.freeze({
      key: pem('M4_ASSIGNMENT_TLS_KEY_FILE', true),
      cert: pem('M4_ASSIGNMENT_TLS_CERT_FILE'),
    }),
    runtime: Object.freeze({
      identityDatabaseURL: required('M4_IDENTITY_DATABASE_URL'),
      dataDatabaseURL: required('M4_DATA_DATABASE_URL'),
      notificationDatabaseURL: required('M4_NOTIFICATION_DATABASE_URL'),
      issuerBaseURL: required('BETTER_AUTH_URL'),
      issuerSecret: required('BETTER_AUTH_SECRET'),
      operationDeadlineMs: number('M4_OPERATION_DEADLINE_MS'),
      notificationDatabaseDeadlineMs: number('M4_NOTIFICATION_DATABASE_DEADLINE_MS'),
    }),
  });
}
