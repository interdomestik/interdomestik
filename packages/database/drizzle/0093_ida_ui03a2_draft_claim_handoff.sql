CREATE UNIQUE INDEX "claim_free_start_draft_origin_uq" ON "claim" USING btree ("tenant_id","userId","origin","origin_ref_id") WHERE "claim"."origin" = 'free_start_draft';
