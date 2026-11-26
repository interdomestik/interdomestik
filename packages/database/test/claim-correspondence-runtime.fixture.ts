import { randomBytes } from 'node:crypto';
import type postgres from 'postgres';

import { withDisposableClient } from '../src/disposable-client';
import { quoteIdentifier, quoteSqlLiteral } from './rls-test-connection';

export const registerTables = [
  'claim_authorities',
  'claim_correspondence',
  'claim_correspondence_documents',
] as const;

export type Connection = {
  admin: postgres.Sql;
  runtime: postgres.Sql;
  peer: postgres.Sql;
  role: string;
};

export type RegisterProof = (connections: Connection) => Promise<void>;

export async function withRuntime(
  admin: postgres.Sql,
  work: RegisterProof,
  runtimeConnections = 1
) {
  const role = `wp12_runtime_${randomBytes(6).toString('hex')}`;
  const roleSql = quoteIdentifier(role);
  const password = randomBytes(24).toString('hex');
  const [{ name }] = await admin<{ name: string }[]>`select current_database() as name`;
  const database = quoteIdentifier(name);
  const runtimeUrl = new URL(process.env.DATABASE_URL!);
  runtimeUrl.pathname = `/${name}`;
  runtimeUrl.username = role;
  runtimeUrl.password = password;

  await admin.unsafe(
    `create role ${roleSql} login noinherit nosuperuser nobypassrls password ${quoteSqlLiteral(password)}`
  );
  try {
    await admin.unsafe(`grant connect, temporary on database ${database} to ${roleSql}`);
    await admin.unsafe(`grant usage on schema public to ${roleSql}`);
    // This mirrors the runtime lane's table-wide DML so every mutation trigger is reachable.
    await admin.unsafe(
      `grant select, insert, update, delete on claim, claim_documents, claim_case_fields, ${registerTables.join(', ')} to ${roleSql}`
    );
    await admin.unsafe(`grant select on claim_inbound_pilot_cases, claim_inbound_upload_decisions,
      claim_correspondence_received_seals, claim_correspondence_received_documents to ${roleSql};
      grant insert (tenant_id, claim_id, correspondence_id, document_count)
        on claim_correspondence_received_seals to ${roleSql};
      grant insert (tenant_id, claim_id, correspondence_id, claim_document_id)
        on claim_correspondence_received_documents to ${roleSql};
      grant insert (tenant_id, claim_id, correlation_id, classification, decided_by, role_basis,
        recipient_id, uploader_id, office_receipt_ref, document_id, bucket, file_path, file_name, mime_type, file_size, sha256)
        on claim_inbound_upload_decisions to ${roleSql};
      grant select, insert, update, delete on documents to ${roleSql}`);
    // The reservation and seal regressions also run against the parent migration for comparison.
    const [{ present }] =
      await admin`select to_regclass('public.claim_inbound_object_verifications') is not null as present`;
    if (present) {
      await admin.unsafe(`grant select on claim_inbound_object_verifications to ${roleSql}`);
    }
    await withDisposableClient(
      runtimeUrl.toString(),
      { applicationName: 'wp12_register_runtime', max: runtimeConnections },
      runtime =>
        withDisposableClient(
          runtimeUrl.toString(),
          { applicationName: 'wp12_register_peer' },
          peer => work({ admin, runtime, peer, role })
        )
    );
  } finally {
    await admin.unsafe(`drop owned by ${roleSql}`);
    await admin.unsafe(`drop role ${roleSql}`);
  }
}
