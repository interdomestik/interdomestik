import { dbAdmin } from '@interdomestik/database/db';
import { readDisposableTargetClass } from '@interdomestik/database/seed-target-classification';
import type { Sql } from 'postgres';

export type ContractDatabaseIdentity = { database: string; started: string; pid: number };

export async function requireMatchingLocalContractDatabase(client: Sql, clientUrl?: string) {
  const refusal = 'Pilot contract requires matching isolated local database targets';
  if (
    readDisposableTargetClass(process.env) !== 'local' ||
    clientUrl !== process.env.DATABASE_URL
  ) {
    throw new Error(refusal);
  }

  const [[fixture], [application]] = await Promise.all(
    [client, dbAdmin.$client].map(
      connection => connection<ContractDatabaseIdentity[]>`
      select current_database() as database,
        extract(epoch from pg_postmaster_start_time())::text as started,
        pg_backend_pid() as pid
    `
    )
  );
  if (
    !fixture ||
    !application ||
    fixture.database !== application.database ||
    fixture.started !== application.started ||
    fixture.pid === application.pid
  ) {
    throw new Error(refusal);
  }
  return fixture;
}
