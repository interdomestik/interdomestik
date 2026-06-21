CREATE TABLE IF NOT EXISTS "claim_document_ai_extraction_consents" (
  "id" text PRIMARY KEY NOT NULL,
  "tenant_id" text NOT NULL,
  "subject_id" text NOT NULL,
  "actor_id" text NOT NULL,
  "claim_id" text NOT NULL,
  "document_id" text NOT NULL,
  "consent_type" text NOT NULL,
  "processing_purpose" text NOT NULL,
  "status" text NOT NULL,
  "privacy_version" text NOT NULL,
  "locale" text NOT NULL,
  "source_surface" text NOT NULL,
  "recorded_at" timestamp DEFAULT now() NOT NULL,
  "granted_at" timestamp,
  "withdrawn_at" timestamp,
  "supersedes_consent_id" text,
  CONSTRAINT "claim_doc_ai_consent_type_check"
    CHECK ("consent_type" = 'ai_document_extraction'),
  CONSTRAINT "claim_doc_ai_processing_purpose_check"
    CHECK ("processing_purpose" = 'ai_document_extraction'),
  CONSTRAINT "claim_doc_ai_consent_status_check"
    CHECK ("status" IN ('accepted', 'withdrawn'))
);
--> statement-breakpoint
ALTER TABLE "claim_document_ai_extraction_consents"
  ADD CONSTRAINT "claim_doc_ai_consents_tenant_id_tenants_id_fk"
  FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id")
  ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "claim_document_ai_extraction_consents"
  ADD CONSTRAINT "claim_doc_ai_consents_subject_id_user_id_fk"
  FOREIGN KEY ("subject_id") REFERENCES "public"."user"("id")
  ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "claim_document_ai_extraction_consents"
  ADD CONSTRAINT "claim_doc_ai_consents_actor_id_user_id_fk"
  FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id")
  ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "claim_document_ai_extraction_consents"
  ADD CONSTRAINT "claim_doc_ai_consents_claim_id_claim_id_fk"
  FOREIGN KEY ("claim_id") REFERENCES "public"."claim"("id")
  ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "claim_document_ai_extraction_consents"
  ADD CONSTRAINT "claim_doc_ai_consents_document_id_claim_documents_id_fk"
  FOREIGN KEY ("document_id") REFERENCES "public"."claim_documents"("id")
  ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_claim_doc_ai_consents_scope"
  ON "claim_document_ai_extraction_consents"
  USING btree ("tenant_id","subject_id","claim_id","document_id","processing_purpose","recorded_at");
--> statement-breakpoint
ALTER TABLE public."claim_document_ai_extraction_consents" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'claim_document_ai_extraction_consents'
      AND policyname = 'tenant_isolation_claim_document_ai_extraction_consents'
  ) THEN
    CREATE POLICY "tenant_isolation_claim_document_ai_extraction_consents"
      ON public."claim_document_ai_extraction_consents"
      USING (tenant_id = (select current_setting('app.current_tenant_id', true))::text)
      WITH CHECK (tenant_id = (select current_setting('app.current_tenant_id', true))::text);
  END IF;
END
$$;
