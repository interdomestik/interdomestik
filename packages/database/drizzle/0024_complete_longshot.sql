CREATE TYPE "public"."message_type" AS ENUM('note', 'email', 'phone', 'whatsapp', 'system');--> statement-breakpoint
CREATE TYPE "public"."thread_status" AS ENUM('open', 'pending_response', 'resolved', 'closed');--> statement-breakpoint
CREATE TYPE "public"."document_entity_type" AS ENUM('claim', 'member', 'thread', 'share_pack');--> statement-breakpoint
CREATE TYPE "public"."document_storage_category" AS ENUM('evidence', 'correspondence', 'contract', 'receipt', 'identity', 'medical', 'legal', 'export', 'other');--> statement-breakpoint
CREATE TABLE "claim_threads" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"claim_id" text NOT NULL,
	"subject" text NOT NULL,
	"status" "thread_status" DEFAULT 'open',
	"external_reference" text,
	"insurer_claim_no" text,
	"policy_no" text,
	"created_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp,
	"last_message_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "document_access_log" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"document_id" text NOT NULL,
	"access_type" text NOT NULL,
	"accessed_by" text,
	"accessed_at" timestamp DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"share_token" text
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"entity_type" "document_entity_type" NOT NULL,
	"entity_id" text NOT NULL,
	"file_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"file_size" integer NOT NULL,
	"storage_path" text NOT NULL,
	"category" "document_storage_category" DEFAULT 'other',
	"description" text,
	"uploaded_by" text NOT NULL,
	"uploaded_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	"deleted_by" text
);
--> statement-breakpoint
ALTER TABLE "claim_threads" ADD CONSTRAINT "claim_threads_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_threads" ADD CONSTRAINT "claim_threads_claim_id_claim_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."claim"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_threads" ADD CONSTRAINT "claim_threads_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_access_log" ADD CONSTRAINT "document_access_log_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_access_log" ADD CONSTRAINT "document_access_log_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_access_log" ADD CONSTRAINT "document_access_log_accessed_by_user_id_fk" FOREIGN KEY ("accessed_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_uploaded_by_user_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_deleted_by_user_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_claim_threads_tenant" ON "claim_threads" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_claim_threads_claim" ON "claim_threads" USING btree ("claim_id");--> statement-breakpoint
CREATE INDEX "idx_claim_threads_tenant_claim" ON "claim_threads" USING btree ("tenant_id","claim_id");--> statement-breakpoint
CREATE INDEX "idx_claim_threads_external_ref" ON "claim_threads" USING btree ("external_reference");--> statement-breakpoint
CREATE INDEX "idx_document_access_log_tenant" ON "document_access_log" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_document_access_log_document" ON "document_access_log" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "idx_document_access_log_time" ON "document_access_log" USING btree ("accessed_at");--> statement-breakpoint
CREATE INDEX "idx_documents_tenant" ON "documents" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_documents_entity" ON "documents" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "idx_documents_tenant_entity" ON "documents" USING btree ("tenant_id","entity_type","entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_documents_storage_path" ON "documents" USING btree ("storage_path");--> statement-breakpoint
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_code_unique" UNIQUE("code");