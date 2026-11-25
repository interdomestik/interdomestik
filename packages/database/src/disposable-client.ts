import postgres from 'postgres';
import { assertDisposableTarget } from './seed-target-guard';

/** What a caller may tune; nothing here can name, add or change the target. */
export type DisposableClientOptions = Readonly<{
  applicationName: string;
  max?: number;
  connectTimeout?: number;
}>;

export type DisposableClient = postgres.Sql;

/**
 * The environment that decides where the driver connects: postgres.js completes the URL from the
 * PG* variables of this process, so exactly those are classified with it. Deployment markers such
 * as NODE_ENV=production (the E2E server's `next start`) say nothing about the target, and
 * DATABASE_URL_RLS is not the URL being opened, so neither refuses nor admits it.
 */
function targetEnvironment(url: string): Readonly<Record<string, string | undefined>> {
  const driver = Object.entries(process.env).filter(([key]) => key.startsWith('PG'));
  return {
    ...Object.fromEntries(driver),
    SEED_TARGET_CONFIRM: process.env.SEED_TARGET_CONFIRM,
    DATABASE_URL: url,
  };
}

/** The check openDisposableClient makes, on its own: for a URL a later step will open. */
export function assertDisposableUrl(url: string): void {
  assertDisposableTarget(targetEnvironment(url));
}

/**
 * R-13: the one client a destructive script may open. The URL is classified together with the
 * environment the driver reads; only a loopback database and the exact, confirmed CI container
 * pass, before any driver is constructed. The URL reaches the driver as given. Driver debug
 * output stays off, since it would carry statements such as role DDL.
 */
export function openDisposableClient(
  url: string,
  options: DisposableClientOptions
): DisposableClient {
  assertDisposableUrl(url);
  return postgres(url, {
    max: options.max ?? 1,
    connect_timeout: options.connectTimeout ?? 10,
    debug: false,
    onnotice: () => {},
    connection: { application_name: options.applicationName },
  });
}

/** Opens a guarded client for `work` and closes it afterwards, also when `work` fails. */
export async function withDisposableClient<T>(
  url: string,
  options: DisposableClientOptions,
  work: (client: DisposableClient) => Promise<T>
): Promise<T> {
  const client = openDisposableClient(url, options);
  return withDisposableCleanup(
    () => work(client),
    () => client.end({ timeout: 5 }),
    `${options.applicationName}: client work and close both failed`
  );
}

/** Preserve both errors when work and its cleanup fail. */
export async function withDisposableCleanup<T>(
  work: () => Promise<T>,
  cleanup: () => Promise<void>,
  failureMessage: string
): Promise<T> {
  let workFailure: { error: unknown } | undefined;
  try {
    return await work();
  } catch (error) {
    workFailure = { error };
    throw error;
  } finally {
    try {
      await cleanup();
    } catch (error) {
      if (!workFailure) throw error;
      throw new AggregateError([workFailure.error, error], failureMessage, {
        cause: workFailure.error,
      });
    }
  }
}
