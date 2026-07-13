import assignments from './data/assignments.mjs';
import accessRoles from './data/items/m03a-access-roles.mjs';
import consentFields from './data/items/m03a-consent-fields.mjs';
import documentBoundary from './data/items/m03a-document-boundary.mjs';
import erasureRevocation from './data/items/m03a-erasure-revocation.mjs';
import medicalBoundary from './data/items/m03a-medical-boundary.mjs';
import privacyOwner from './data/items/m03a-privacy-owner.mjs';
import scopeStops from './data/items/m03a-scope-stops.mjs';
import threatRecheck from './data/items/m03a-threat-recheck.mjs';
import partAMetadata from './data/packets/mob-03a-part-a.mjs';
import partBMetadata from './data/packets/mob-03a-part-b.mjs';
import reviewers from './data/reviewers.mjs';

const packets = [
  { ...partAMetadata, items: [privacyOwner, medicalBoundary, consentFields, accessRoles] },
  { ...partBMetadata, items: [documentBoundary, threatRecheck, erasureRevocation, scopeStops] },
];

export const fixtureCatalog = Object.freeze({ assignments, packets, reviewers });
