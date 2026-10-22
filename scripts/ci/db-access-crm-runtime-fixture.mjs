import assert from 'node:assert/strict';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';

// The protected parent supplies an owned PG16 endpoint; never reuse an application database.
export async function createCrmFixture(baseUrl, root) {
  const address = new URL(baseUrl);
  assert.equal(address.protocol, 'postgresql:');
  assert.equal(address.hostname, '127.0.0.1');
  assert.equal(address.username, 'postgres');
  assert.equal(address.pathname, '/interdomestik_test');
  assert.ok(['5432', '55438', '55440'].includes(address.port));
  assert.ok(address.password && !address.search && !address.hash);
  const token = randomBytes(12).toString('hex');
  const database = 's8_crm_db_' + token;
  const role = 's8_crm_app_' + token;
  const password = randomBytes(32).toString('hex');
  const owner = postgres(baseUrl, { max: 1, onnotice: () => {} });
  let createdDatabase = false,
    createdRole = false,
    admin;
  async function retire() {
    if (admin) await admin.end({ timeout: 2 });
    if (createdDatabase) {
      await owner`select pg_terminate_backend(pid) from pg_stat_activity where datname=${database} and pid<>pg_backend_pid()`;
      await owner.unsafe('DROP DATABASE "' + database + '"');
      const rows = await owner`select oid from pg_database where datname=${database}`;
      assert.equal(rows.length, 0);
    }
    if (createdRole) {
      await owner.unsafe('DROP ROLE "' + role + '"');
      const rows = await owner`select oid from pg_roles where rolname=${role}`;
      assert.equal(rows.length, 0);
    }
    await owner.end({ timeout: 2 });
  }
  try {
    const [server] = await owner`select current_setting('server_version_num')::int as version`;
    assert.ok(server.version >= 160000 && server.version < 170000);
    await owner.unsafe('CREATE DATABASE "' + database + '"');
    createdDatabase = true;
    address.pathname = '/' + database;
    const adminUrl = address.toString();
    admin = postgres(adminUrl, { max: 1, onnotice: () => {} });
    await migrate(drizzle(admin), {
      migrationsFolder: path.join(root, 'packages/database/drizzle'),
    });
    await owner.unsafe(
      'CREATE ROLE "' +
        role +
        '" LOGIN NOSUPERUSER NOBYPASSRLS NOINHERIT NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD ' +
        "'" +
        password +
        "'"
    );
    createdRole = true;
    await admin.unsafe(
      'GRANT USAGE ON SCHEMA public TO "' +
        role +
        '"; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO "' +
        role +
        '"; GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO "' +
        role +
        '"'
    );
    await admin.unsafe(
      'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE,SELECT ON SEQUENCES TO \"' +
        role +
        '\"'
    );
    for (const [id, country] of [
      ['tenant_ks', 'KS'],
      ['tenant_mk', 'MK'],
    ]) {
      await admin`insert into tenants (id,name,legal_name,country_code) values (${id},${id},${id},${country}) on conflict (id) do nothing`;
      for (const kind of ['admin', 'agent']) {
        const userId = 'crm-' + kind + '-' + country;
        const email = kind + '.' + country.toLowerCase() + '@interdomestik.com';
        await admin`insert into "user" (id,tenant_id,name,email,"emailVerified",role,"createdAt","updatedAt")
          values (${userId},${id},${userId},${email},false,${kind},now(),now())`;
      }
    }
    await admin`insert into branches (id,tenant_id,name,slug) values ('crm-foreign-branch','tenant_mk','Foreign','crm-foreign')`;
    address.username = role;
    address.password = password;
    return { adminUrl, restrictedUrl: address.toString(), role, postgres: server.version, retire };
  } catch (error) {
    await retire();
    throw error;
  }
}
