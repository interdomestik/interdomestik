ALTER TABLE "claim_documents" ADD CONSTRAINT "claim_documents_file_path_canonical_ck" CHECK (("claim_documents"."file_path" COLLATE pg_catalog."C") ~ '^[A-Za-z0-9._-]+(/[A-Za-z0-9._-]+)*$'
        AND ("claim_documents"."file_path" COLLATE pg_catalog."C") !~ '(^|/)[.](/|$)'
        AND ("claim_documents"."file_path" COLLATE pg_catalog."C") !~ '[.][.]');--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_storage_path_canonical_ck" CHECK (("documents"."storage_path" COLLATE pg_catalog."C") ~ '^[A-Za-z0-9._-]+(/[A-Za-z0-9._-]+)*$'
        AND ("documents"."storage_path" COLLATE pg_catalog."C") !~ '(^|/)[.](/|$)'
        AND ("documents"."storage_path" COLLATE pg_catalog."C") !~ '[.][.]');