WITH ranked_plan_matches AS (
  SELECT
    s.id AS subscription_id,
    mp.id AS canonical_plan_key,
    mp.tier::text AS canonical_plan_id,
    ROW_NUMBER() OVER (
      PARTITION BY s.id
      ORDER BY
        CASE
          WHEN s.plan_key = mp.id THEN 0
          WHEN s.plan_id = mp.id THEN 1
          WHEN s.plan_id = mp.paddle_price_id THEN 2
          WHEN s.plan_id = mp.tier::text THEN 3
          ELSE 4
        END,
        mp.id
    ) AS plan_rank
  FROM "subscriptions" s
  INNER JOIN "membership_plans" mp
    ON mp."tenant_id" = s."tenant_id"
   AND (
     s."plan_key" = mp."id"
     OR s."plan_id" = mp."id"
     OR s."plan_id" = mp."paddle_price_id"
     OR (
       s."plan_id" = mp."tier"::text
       AND mp."interval" = 'year'
       AND mp."is_active" = true
       AND EXISTS (
         SELECT 1
         FROM "membership_plans" mp2
         WHERE mp2."tenant_id" = mp."tenant_id"
           AND mp2."tier" = mp."tier"
           AND mp2."interval" = 'year'
           AND mp2."is_active" = true
         GROUP BY mp2."tenant_id", mp2."tier"
         HAVING COUNT(*) = 1
       )
     )
   )
)
UPDATE "subscriptions" s
SET
  "plan_key" = rpm.canonical_plan_key,
  "plan_id" = rpm.canonical_plan_id
FROM ranked_plan_matches rpm
WHERE s."id" = rpm.subscription_id
  AND rpm.plan_rank = 1
  AND (
    s."plan_key" IS DISTINCT FROM rpm.canonical_plan_key
    OR s."plan_id" IS DISTINCT FROM rpm.canonical_plan_id
  );
