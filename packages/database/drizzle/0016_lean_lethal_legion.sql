CREATE INDEX "idx_claims_tenant_branch" ON "claim" USING btree ("tenant_id","branch_id");--> statement-breakpoint
CREATE INDEX "idx_claims_tenant_branch_status" ON "claim" USING btree ("tenant_id","branch_id","status");--> statement-breakpoint
CREATE INDEX "idx_claims_tenant_status_created" ON "claim" USING btree ("tenant_id","status","createdAt");--> statement-breakpoint
CREATE INDEX "idx_lead_payment_attempts_tenant_lead" ON "lead_payment_attempts" USING btree ("tenant_id","lead_id");--> statement-breakpoint
CREATE INDEX "idx_lead_payment_attempts_tenant_lead_method_status" ON "lead_payment_attempts" USING btree ("tenant_id","lead_id","method","status");--> statement-breakpoint
CREATE INDEX "idx_member_leads_tenant_branch" ON "member_leads" USING btree ("tenant_id","branch_id");--> statement-breakpoint
CREATE INDEX "idx_member_leads_tenant_agent" ON "member_leads" USING btree ("tenant_id","agent_id");