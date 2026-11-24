-- Return known business refusals without sending a query error to the transaction driver.
CREATE FUNCTION public.membership_try_insert_individual_sale(candidate jsonb)
RETURNS text
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  violation text;
BEGIN
  INSERT INTO public.membership_sales
  SELECT * FROM jsonb_populate_record(NULL::public.membership_sales, candidate);
  RETURN NULL;
EXCEPTION
  WHEN unique_violation OR check_violation THEN
    GET STACKED DIAGNOSTICS violation = CONSTRAINT_NAME;
    IF SQLSTATE = '23505' AND violation = 'membership_sales_live_lead_uq' THEN
      RETURN 'conflict';
    ELSIF SQLSTATE = '23514' AND violation = 'membership_sales_stale_offer' THEN
      RETURN 'stale_offer';
    ELSIF SQLSTATE = '23514' AND violation = 'membership_sales_stale_rate' THEN
      RETURN 'stale_rate';
    END IF;
    RAISE;
END;
$$;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION public.membership_try_insert_individual_sale(jsonb) FROM PUBLIC;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'interdomestik_runtime_rls') THEN
    GRANT EXECUTE ON FUNCTION public.membership_try_insert_individual_sale(jsonb)
      TO interdomestik_runtime_rls;
  END IF;
END;
$$;
