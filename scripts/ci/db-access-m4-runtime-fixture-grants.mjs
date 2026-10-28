// Fixed trusted producer grant lists, transcribed from the reviewed canonical schema.
// Never import candidate schema/code into the administrator process to derive privileges.
export const quote = value => '"' + value.replaceAll('"', '""') + '"';
const columns = names => names.map(quote).join(',');
const USER = [
  'id',
  'tenant_id',
  'residence_country',
  'name',
  'email',
  'emailVerified',
  'image',
  'role',
  'marketing_opt_in',
  'referral_code',
  'consent_at',
  'member_number',
  'member_number_issued_at',
  'tenant_classification_pending',
  'createdAt',
  'updatedAt',
  'agentId',
  'branch_id',
  'created_by',
  'assisted_by_agent_id',
];
const SESSION = [
  'id',
  'expiresAt',
  'token',
  'createdAt',
  'updatedAt',
  'ipAddress',
  'userAgent',
  'userId',
];
const AUDIT = [
  'id',
  'tenant_id',
  'actor_id',
  'actor_role',
  'action',
  'entity_type',
  'entity_id',
  'metadata',
  'created_at',
];
const LEDGER = [
  'operation_id',
  'tenant_id',
  'actor_id',
  'claim_id',
  'command',
  'version',
  'request_fingerprint',
  'response',
  'created_at',
];
const NOTICE = [
  'id',
  'tenant_id',
  'user_id',
  'type',
  'title',
  'content',
  'action_url',
  'is_read',
  'created_at',
];
export async function installPurposeGrants(f) {
  const { admin, identityRole, dataRole, notificationRole, profiles, policies } = f;
  const policy = (role, table, suffix, clause) => {
    const name = role + '_' + suffix;
    policies.push({ table, name });
    return `CREATE POLICY ${quote(name)} ON public.${quote(table)} ${clause};`;
  };
  await admin.unsafe(`GRANT SELECT (${columns(USER)}) ON public."user" TO ${quote(identityRole)};
    GRANT SELECT (${columns(SESSION)}) ON public.session TO ${quote(identityRole)};
    GRANT DELETE ON public.session TO ${quote(identityRole)};
    ${policy(identityRole, 'user', 'user', 'FOR SELECT TO ' + quote(identityRole) + ' USING(true)')}
    ${policy(identityRole, 'session', 'session_read', 'FOR SELECT TO ' + quote(identityRole) + ' USING(true)')}
    ${policy(identityRole, 'session', 'session_delete', 'FOR DELETE TO ' + quote(identityRole) + ' USING(true)')}
    GRANT SELECT (${profiles ? 'id,role,tenant_id,branch_id,name,email' : 'id,role,tenant_id'}) ON public."user" TO ${quote(dataRole)};
    GRANT UPDATE (id) ON public."user" TO ${quote(dataRole)};
    ${policy(dataRole, 'user', 'user_read', `FOR SELECT TO ${quote(dataRole)} USING(tenant_id=current_setting('app.current_tenant_id',true))`)}
    ${policy(dataRole, 'user', 'user_lock', `FOR UPDATE TO ${quote(dataRole)} USING(tenant_id=current_setting('app.current_tenant_id',true)) WITH CHECK(false)`)}
    ${policy(dataRole, 'user', 'user_no_write', `AS RESTRICTIVE FOR UPDATE TO ${quote(dataRole)} USING(tenant_id=current_setting('app.current_tenant_id',true)) WITH CHECK(false)`)}
    GRANT SELECT (id,tenant_id,"staffId",${profiles ? 'branch_id,title,' : ''}claim_number,case_lifecycle_state,recovery_lifecycle_state,"assignedAt","assignedById") ON public.claim TO ${quote(dataRole)};
    GRANT UPDATE ("staffId","assignedAt","assignedById","updatedAt") ON public.claim TO ${quote(dataRole)};
    GRANT INSERT (${columns(AUDIT)}) ON public.audit_log TO ${quote(dataRole)};
    GRANT SELECT (id,entity_id) ON public.audit_log TO ${quote(dataRole)};
    GRANT SELECT (${columns(LEDGER)}), INSERT (${columns(LEDGER)}) ON public.operation_results TO ${quote(dataRole)};`);
  if (!profiles) return;
  await admin.unsafe(`GRANT SELECT (${columns(LEDGER)}) ON operation_results TO ${quote(notificationRole)};
    GRANT SELECT (id,tenant_id,"staffId",title) ON claim TO ${quote(notificationRole)};
    GRANT SELECT (id,tenant_id,role,name,email,"emailVerified") ON "user" TO ${quote(notificationRole)};
    GRANT INSERT (${columns(NOTICE)}),SELECT(id) ON notifications TO ${quote(notificationRole)};
    ${policy(notificationRole, 'notifications', 'notice_insert', `FOR INSERT TO ${quote(notificationRole)} WITH CHECK(tenant_id=current_setting('app.current_access_tenant_id',true))`)}
    ${policy(notificationRole, 'notifications', 'notice_read', `FOR SELECT TO ${quote(notificationRole)} USING(tenant_id=current_setting('app.current_access_tenant_id',true))`)} `);
  for (const table of ['operation_results', 'claim', 'user']) {
    const column = table === 'operation_results' ? 'operation_id' : 'id';
    await admin.unsafe(`GRANT UPDATE(${quote(column)}) ON ${quote(table)} TO ${quote(notificationRole)};
      ${policy(notificationRole, table, table + '_read', `FOR SELECT TO ${quote(notificationRole)} USING(tenant_id=current_setting('app.current_access_tenant_id',true))`)}
      ${policy(notificationRole, table, table + '_lock', `FOR UPDATE TO ${quote(notificationRole)} USING(tenant_id=current_setting('app.current_access_tenant_id',true)) WITH CHECK(false)`)}
      ${policy(notificationRole, table, table + '_no_write', `AS RESTRICTIVE FOR UPDATE TO ${quote(notificationRole)} USING(tenant_id=current_setting('app.current_access_tenant_id',true)) WITH CHECK(false)`)} `);
  }
}
