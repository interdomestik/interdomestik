ALTER TABLE "claim_information_requests" DROP CONSTRAINT "claim_information_requests_posture_check";--> statement-breakpoint
ALTER TABLE "claim_information_requests" ADD COLUMN "fulfilled_at" timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "claim_information_requests" ADD COLUMN "fulfilled_by_staff_id" text;--> statement-breakpoint
ALTER TABLE "claim_information_requests" ADD COLUMN "fulfilled_document_id" text;--> statement-breakpoint
ALTER TABLE "claim_information_requests" ADD CONSTRAINT "claim_information_requests_fulfilled_by_staff_id_user_id_fk" FOREIGN KEY ("fulfilled_by_staff_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_information_requests" ADD CONSTRAINT "claim_information_requests_fulfilled_evidence_fk" FOREIGN KEY ("id","fulfilled_document_id") REFERENCES "public"."claim_information_request_evidence"("request_id","document_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_information_requests" ADD CONSTRAINT "claim_information_requests_posture_check" CHECK ("claim_information_requests"."sla_posture" = 'incomplete' and (
          ("claim_information_requests"."status" = 'open' and "claim_information_requests"."fulfilled_at" is null and "claim_information_requests"."fulfilled_by_staff_id" is null and "claim_information_requests"."fulfilled_document_id" is null)
          or ("claim_information_requests"."status" = 'fulfilled' and "claim_information_requests"."fulfilled_at" is not null and "claim_information_requests"."fulfilled_by_staff_id" is not null and "claim_information_requests"."fulfilled_document_id" is not null)
        ));