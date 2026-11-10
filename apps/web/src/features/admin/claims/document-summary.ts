/** Allocation metadata; document presence alone does not establish evidence completeness. */
export type ClaimDocumentSummary = Readonly<{
  count: number;
  evidenceComplete: null;
}>;
