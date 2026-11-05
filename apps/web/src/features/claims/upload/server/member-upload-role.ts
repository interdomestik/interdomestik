/**
 * Member-portal claim evidence uploads are signed only for member actors (agents act as members).
 * Staff and administrators upload through the admin evidence surface, and read-only roles such as
 * auditor and global_support never receive a storage write capability, even for a claim they own.
 */
const MEMBER_UPLOAD_ROLES: ReadonlySet<string> = new Set(['member', 'user', 'agent']);

export function isMemberUploadRole(role: string | null | undefined): boolean {
  return typeof role === 'string' && MEMBER_UPLOAD_ROLES.has(role);
}
