-- Keep the ID-only foreign keys and bind every case child to the case's home tenant.
-- MATCH SIMPLE preserves a handoff without a case and evidence without a source document.
ALTER TABLE public.case_scoped_access_grants
  ADD CONSTRAINT case_scoped_access_grants_case_home_fk
  FOREIGN KEY (tenant_id, case_id) REFERENCES public.claim (tenant_id, id)
  MATCH SIMPLE NOT VALID;
--> statement-breakpoint
ALTER TABLE public.claim_document_ai_extraction_consents
  ADD CONSTRAINT claim_document_ai_extraction_consents_case_home_fk
  FOREIGN KEY (tenant_id, claim_id) REFERENCES public.claim (tenant_id, id)
  MATCH SIMPLE NOT VALID;
--> statement-breakpoint
ALTER TABLE public.claim_documents
  ADD CONSTRAINT claim_documents_case_home_fk
  FOREIGN KEY (tenant_id, claim_id) REFERENCES public.claim (tenant_id, id)
  MATCH SIMPLE NOT VALID;
--> statement-breakpoint
ALTER TABLE public.claim_escalation_agreements
  ADD CONSTRAINT claim_escalation_agreements_case_home_fk
  FOREIGN KEY (tenant_id, claim_id) REFERENCES public.claim (tenant_id, id)
  MATCH SIMPLE NOT VALID;
--> statement-breakpoint
ALTER TABLE public.claim_information_requests
  ADD CONSTRAINT claim_information_requests_case_home_fk
  FOREIGN KEY (tenant_id, claim_id) REFERENCES public.claim (tenant_id, id)
  MATCH SIMPLE NOT VALID;
--> statement-breakpoint
ALTER TABLE public.claim_messages
  ADD CONSTRAINT claim_messages_case_home_fk
  FOREIGN KEY (tenant_id, claim_id) REFERENCES public.claim (tenant_id, id)
  MATCH SIMPLE NOT VALID;
--> statement-breakpoint
ALTER TABLE public.claim_recovery_no_fee_evidence
  ADD CONSTRAINT claim_recovery_no_fee_evidence_case_home_fk
  FOREIGN KEY (tenant_id, claim_id) REFERENCES public.claim (tenant_id, id)
  MATCH SIMPLE NOT VALID;
--> statement-breakpoint
ALTER TABLE public.claim_stage_history
  ADD CONSTRAINT claim_stage_history_case_home_fk
  FOREIGN KEY (tenant_id, claim_id) REFERENCES public.claim (tenant_id, id)
  MATCH SIMPLE NOT VALID;
--> statement-breakpoint
ALTER TABLE public.claim_threads
  ADD CONSTRAINT claim_threads_case_home_fk
  FOREIGN KEY (tenant_id, claim_id) REFERENCES public.claim (tenant_id, id)
  MATCH SIMPLE NOT VALID;
--> statement-breakpoint
ALTER TABLE public.claim_tracking_tokens
  ADD CONSTRAINT claim_tracking_tokens_case_home_fk
  FOREIGN KEY (tenant_id, claim_id) REFERENCES public.claim (tenant_id, id)
  MATCH SIMPLE NOT VALID;
--> statement-breakpoint
ALTER TABLE public.claim_transition_evidence
  ADD CONSTRAINT claim_transition_evidence_case_home_fk
  FOREIGN KEY (tenant_id, claim_id) REFERENCES public.claim (tenant_id, id)
  MATCH SIMPLE NOT VALID;
--> statement-breakpoint
ALTER TABLE public.support_handoffs
  ADD CONSTRAINT support_handoffs_case_home_fk
  FOREIGN KEY (tenant_id, claim_id) REFERENCES public.claim (tenant_id, id)
  MATCH SIMPLE NOT VALID;
--> statement-breakpoint
ALTER TABLE public.claim_document_ai_extraction_consents
  ADD CONSTRAINT claim_document_ai_extraction_consents_document_case_fk
  FOREIGN KEY (tenant_id, claim_id, document_id) REFERENCES public.claim_documents (tenant_id, claim_id, id)
  MATCH SIMPLE NOT VALID;
--> statement-breakpoint
ALTER TABLE public.claim_transition_evidence
  ADD CONSTRAINT claim_transition_evidence_document_case_fk
  FOREIGN KEY (tenant_id, claim_id, source_document_id) REFERENCES public.claim_documents (tenant_id, claim_id, id)
  MATCH SIMPLE NOT VALID;
--> statement-breakpoint

-- Existing rows must pass validation before the journal transaction can commit.
ALTER TABLE public.case_scoped_access_grants
  VALIDATE CONSTRAINT case_scoped_access_grants_case_home_fk;
--> statement-breakpoint
ALTER TABLE public.claim_document_ai_extraction_consents
  VALIDATE CONSTRAINT claim_document_ai_extraction_consents_case_home_fk;
--> statement-breakpoint
ALTER TABLE public.claim_documents
  VALIDATE CONSTRAINT claim_documents_case_home_fk;
--> statement-breakpoint
ALTER TABLE public.claim_escalation_agreements
  VALIDATE CONSTRAINT claim_escalation_agreements_case_home_fk;
--> statement-breakpoint
ALTER TABLE public.claim_information_requests
  VALIDATE CONSTRAINT claim_information_requests_case_home_fk;
--> statement-breakpoint
ALTER TABLE public.claim_messages
  VALIDATE CONSTRAINT claim_messages_case_home_fk;
--> statement-breakpoint
ALTER TABLE public.claim_recovery_no_fee_evidence
  VALIDATE CONSTRAINT claim_recovery_no_fee_evidence_case_home_fk;
--> statement-breakpoint
ALTER TABLE public.claim_stage_history
  VALIDATE CONSTRAINT claim_stage_history_case_home_fk;
--> statement-breakpoint
ALTER TABLE public.claim_threads
  VALIDATE CONSTRAINT claim_threads_case_home_fk;
--> statement-breakpoint
ALTER TABLE public.claim_tracking_tokens
  VALIDATE CONSTRAINT claim_tracking_tokens_case_home_fk;
--> statement-breakpoint
ALTER TABLE public.claim_transition_evidence
  VALIDATE CONSTRAINT claim_transition_evidence_case_home_fk;
--> statement-breakpoint
ALTER TABLE public.support_handoffs
  VALIDATE CONSTRAINT support_handoffs_case_home_fk;
--> statement-breakpoint
ALTER TABLE public.claim_document_ai_extraction_consents
  VALIDATE CONSTRAINT claim_document_ai_extraction_consents_document_case_fk;
--> statement-breakpoint
ALTER TABLE public.claim_transition_evidence
  VALIDATE CONSTRAINT claim_transition_evidence_document_case_fk;
