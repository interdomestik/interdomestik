-- Storage policy check
select policyname, roles, qual
from pg_policies
where schemaname = 'storage' and tablename = 'objects';
