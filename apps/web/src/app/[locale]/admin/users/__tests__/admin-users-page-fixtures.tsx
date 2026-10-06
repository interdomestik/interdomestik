import { vi } from 'vitest';

vi.mock('@/components/admin/users-sections', () => ({
  UsersSections: (props: { users: unknown[]; assignmentChoicesAvailable?: boolean }) => (
    <div
      data-testid="users-sections"
      data-choices-available={props.assignmentChoicesAvailable}
      data-users={props.users.length}
    />
  ),
}));

vi.mock('@/components/admin/admin-users-read-recovery', () => ({
  AdminUsersReadRecovery: ({
    message,
    children,
  }: {
    message: string | null;
    children: React.ReactNode;
  }) => (
    <div>
      {message && <p role="alert">{message}</p>}
      {children}
    </div>
  ),
}));
