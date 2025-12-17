CREATE TYPE "public"."document_category" AS ENUM('evidence', 'correspondence', 'contract', 'receipt', 'other');--> statement-breakpoint
CREATE TYPE "public"."status" AS ENUM('draft', 'submitted', 'verification', 'evaluation', 'negotiation', 'court', 'resolved', 'rejected');--> statement-breakpoint
CREATE TABLE "claim_documents" (
	"id" text PRIMARY KEY NOT NULL,
	"claim_id" text NOT NULL,
	"name" text NOT NULL,
	"file_path" text NOT NULL,
	"file_type" text NOT NULL,
	"file_size" integer NOT NULL,
	"bucket" text DEFAULT 'claim-evidence' NOT NULL,
	"classification" text DEFAULT 'pii' NOT NULL,
	"category" "document_category" DEFAULT 'evidence' NOT NULL,
	"uploaded_by" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "claim_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"claim_id" text NOT NULL,
	"sender_id" text NOT NULL,
	"content" text NOT NULL,
	"is_internal" boolean DEFAULT false,
	"read_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "claim" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"agentId" text,
	"title" text NOT NULL,
	"description" text,
	"status" "status" DEFAULT 'draft',
	"category" text NOT NULL,
	"companyName" text NOT NULL,
	"amount" numeric(10, 2),
	"currency" text DEFAULT 'EUR',
	"createdAt" timestamp DEFAULT now(),
	"updatedAt" timestamp
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"category" text NOT NULL,
	"status" text DEFAULT 'new',
	"createdAt" timestamp DEFAULT now(),
	"updatedAt" timestamp
);
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "role" text DEFAULT 'user' NOT NULL;--> statement-breakpoint
ALTER TABLE "claim_documents" ADD CONSTRAINT "claim_documents_claim_id_claim_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."claim"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_documents" ADD CONSTRAINT "claim_documents_uploaded_by_user_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_messages" ADD CONSTRAINT "claim_messages_claim_id_claim_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."claim"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_messages" ADD CONSTRAINT "claim_messages_sender_id_user_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim" ADD CONSTRAINT "claim_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim" ADD CONSTRAINT "claim_agentId_user_id_fk" FOREIGN KEY ("agentId") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;