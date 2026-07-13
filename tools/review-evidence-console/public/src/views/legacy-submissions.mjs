export function applyLegacySubmission(row) {
  const legacy = row.submissionStatus ? null : row.legacySubmission;
  return legacy
    ? {
        ...row,
        submissionStatus: 'legacy_submitted',
        legacyReceiptId: legacy.receiptId,
        legacySubmittedAt: legacy.submittedAt,
      }
    : row;
}
