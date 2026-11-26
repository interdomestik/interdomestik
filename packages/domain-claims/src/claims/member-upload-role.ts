export function isMemberUploadRole(role: string | null | undefined): boolean {
  return role === 'member' || role === 'user' || role === 'agent';
}
