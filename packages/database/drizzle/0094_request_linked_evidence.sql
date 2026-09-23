CREATE TABLE "claim_information_request_evidence" (
	"tenant_id" text NOT NULL,
	"claim_id" text NOT NULL,
	"request_id" uuid NOT NULL,
	"document_id" text NOT NULL,
	"submitted_by_member_id" text NOT NULL,
	"submitted_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"acknowledged_by_staff_id" text,
	"acknowledged_at" timestamp (3) with time zone,
	CONSTRAINT "claim_information_request_evidence_pk" PRIMARY KEY("request_id","document_id"),
	CONSTRAINT "claim_information_request_evidence_ack_check" CHECK (("claim_information_request_evidence"."acknowledged_at" is null and "claim_information_request_evidence"."acknowledged_by_staff_id" is null)
          or ("claim_information_request_evidence"."acknowledged_at" is not null and "claim_information_request_evidence"."acknowledged_by_staff_id" is not null))
);
--> statement-breakpoint
ALTER TABLE "claim_information_request_evidence" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE UNIQUE INDEX "claim_information_requests_tenant_claim_id_uq" ON "claim_information_requests" USING btree ("tenant_id","claim_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "claim_documents_tenant_claim_id_uq" ON "claim_documents" USING btree ("tenant_id","claim_id","id");--> statement-breakpoint
ALTER TABLE "claim_information_request_evidence" ADD CONSTRAINT "claim_information_request_evidence_submitted_by_member_id_user_id_fk" FOREIGN KEY ("submitted_by_member_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_information_request_evidence" ADD CONSTRAINT "claim_information_request_evidence_acknowledged_by_staff_id_user_id_fk" FOREIGN KEY ("acknowledged_by_staff_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_information_request_evidence" ADD CONSTRAINT "claim_information_request_evidence_request_fk" FOREIGN KEY ("tenant_id","claim_id","request_id") REFERENCES "public"."claim_information_requests"("tenant_id","claim_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_information_request_evidence" ADD CONSTRAINT "claim_information_request_evidence_document_fk" FOREIGN KEY ("tenant_id","claim_id","document_id") REFERENCES "public"."claim_documents"("tenant_id","claim_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "claim_information_request_evidence_document_uq" ON "claim_information_request_evidence" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "claim_information_request_evidence_request_idx" ON "claim_information_request_evidence" USING btree ("tenant_id","claim_id","request_id","submitted_at");--> statement-breakpoint
CREATE POLICY "claim_information_request_evidence_tenant_policy" ON "claim_information_request_evidence" AS PERMISSIVE FOR ALL TO public USING ("claim_information_request_evidence"."tenant_id" = (select current_setting('app.current_tenant_id', true))::text) WITH CHECK ("claim_information_request_evidence"."tenant_id" = (select current_setting('app.current_tenant_id', true))::text);
