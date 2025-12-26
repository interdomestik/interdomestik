export function canAccessNotes(role: string | undefined): boolean {
  return ['agent', 'staff', 'admin'].includes(role || '');
}
