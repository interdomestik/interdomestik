import { OpsDocumentsPanel } from '@/components/ops';
import type { getAssignedStaffClaimDocuments } from '@/features/staff/claims/server/get-assigned-claim-documents';

type AssignedClaimDocumentList = Awaited<ReturnType<typeof getAssignedStaffClaimDocuments>>;

interface StaffClaimDocumentsSectionProps {
  documents: AssignedClaimDocumentList | null;
  emptyLabel: string;
  errorLabel: string;
  isAssignedStaff: boolean;
  retryHref: string;
  retryLabel: string;
  title: string;
  viewLabel: string;
}

// Presentation only: the authorized read already ran in the page. A null result is either "not the
// assigned staff" (render nothing) or a failed read (render a retry), never an empty list.
export function StaffClaimDocumentsSection({
  documents,
  emptyLabel,
  errorLabel,
  isAssignedStaff,
  retryHref,
  retryLabel,
  title,
  viewLabel,
}: StaffClaimDocumentsSectionProps) {
  if (documents) {
    return (
      <div data-testid="staff-claim-documents">
        <OpsDocumentsPanel
          title={title}
          documents={documents.map(doc => ({
            id: doc.id,
            name: doc.name,
            url: doc.url,
          }))}
          emptyLabel={emptyLabel}
          viewLabel={viewLabel}
        />
      </div>
    );
  }
  if (!isAssignedStaff) return null;

  // The heading stays outside <output>, which only permits phrasing content.
  return (
    <div data-testid="staff-claim-documents-error" className="space-y-2">
      <h3 className="font-medium">{title}</h3>
      <output className="block space-y-2">
        <span className="block">{errorLabel}</span>
        <a className="inline-block underline" href={retryHref}>
          {retryLabel}
        </a>
      </output>
    </div>
  );
}
