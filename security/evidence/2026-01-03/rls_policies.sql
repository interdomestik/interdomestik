-- RLS policy coverage
select schemaname, tablename, policyname, roles, qual
from pg_policies
where tablename in ('user', 'session', 'account', 'verification', 'subscriptions');
