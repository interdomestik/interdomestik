import { OpsDocumentsPanel } from '@/components/ops';
import type { getAssignedStaffClaimDocuments } from '@/features/staff/claims/server/get-assigned-claim-documents';
import { SECTION_DOCUMENTS } from '@/features/staff/claims/components/staff-claim-workspace-view';

type AssignedClaimDocumentList = Awaited<
  ReturnType<typeof getAssignedStaffClaimDocuments>
>['documents'];
type PageLink = { href: string; label: string };

interface StaffClaimDocumentsSectionProps {
  documents: AssignedClaimDocumentList | null;
  emptyLabel: string;
  errorLabel: string;
  isAssignedStaff: boolean;
  nextPage?: PageLink;
  previousPage?: PageLink;
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
  nextPage,
  previousPage,
  retryHref,
  retryLabel,
  title,
  viewLabel,
}: Readonly<StaffClaimDocumentsSectionProps>) {
  if (documents) {
    return (
      <div
        id={SECTION_DOCUMENTS}
        className="min-w-0 scroll-mt-80 md:scroll-mt-20"
        data-testid="staff-claim-documents"
      >
        <OpsDocumentsPanel
          title={title}
          headerLayout="wrap"
          documents={documents.map(doc => ({
            id: doc.id,
            name: doc.name,
            url: doc.url,
          }))}
          emptyLabel={emptyLabel}
          viewLabel={viewLabel}
        />
        {(previousPage || nextPage) && (
          <nav aria-label={title} className="mt-2 flex gap-4 text-sm">
            {[previousPage, nextPage].map(link =>
              link ? (
                <a key={link.href} href={`${link.href}#${SECTION_DOCUMENTS}`} className="underline">
                  {link.label}
                </a>
              ) : null
            )}
          </nav>
        )}
      </div>
    );
  }
  if (!isAssignedStaff) return null;

  // The heading stays outside <output>, which only permits phrasing content.
  return (
    <div
      id={SECTION_DOCUMENTS}
      data-testid="staff-claim-documents-error"
      className="min-w-0 scroll-mt-80 space-y-2 md:scroll-mt-20"
    >
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
