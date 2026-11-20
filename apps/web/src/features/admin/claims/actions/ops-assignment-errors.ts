// Client-safe assignment denial texts. The server returns them verbatim; the admin card maps them
// to localized copy, so this module must stay free of database, auth and server-only imports.
export const ASSIGNMENT_TARGET_DENIED_ERROR = 'Staff member not found or out of scope';
export const ASSIGNMENT_CONFLICT_ERROR = 'Claim changed. Reload and try again.';
export const ASSIGNMENT_DRAFT_ERROR = 'A draft claim cannot be assigned before it is submitted.';
