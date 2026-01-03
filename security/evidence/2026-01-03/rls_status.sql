-- RLS status check
select relname, relrowsecurity
from pg_class
where relname in ('user', 'session', 'account', 'verification', 'subscriptions');
