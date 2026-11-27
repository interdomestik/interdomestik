ALTER TABLE "exchange_rates" DROP CONSTRAINT "exchange_rates_tenant_book_week_revision_uq";
--> statement-breakpoint
CREATE FUNCTION public.exchange_rate_verifications_require_check_fn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
BEGIN
  RAISE check_violation USING CONSTRAINT = 'exchange_rate_verifications_check_required';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER exchange_rate_verifications_check_required
BEFORE INSERT ON public.exchange_rate_verifications
FOR EACH ROW WHEN (NEW.check_id IS NULL)
EXECUTE FUNCTION public.exchange_rate_verifications_require_check_fn();
