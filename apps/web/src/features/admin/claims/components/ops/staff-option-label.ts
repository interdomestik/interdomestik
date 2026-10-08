/**
 * Visible option text for a staff assignment target. The email keeps same-name staff
 * distinguishable; nameless staff fall back to the email alone. Headers that show the current
 * owner keep the plain display name and do not use this.
 */
export function formatStaffOptionLabel(
  member: Readonly<{ name: string | null; email: string }>
): string {
  return member.name ? `${member.name} (${member.email})` : member.email;
}
