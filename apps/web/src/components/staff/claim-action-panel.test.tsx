import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ClaimActionPanel } from './claim-action-panel';

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/actions/staff-claims', () => ({
  assignClaim: vi.fn().mockResolvedValue({ success: true }),
  updateClaimStatus: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock('@interdomestik/ui', () => ({
  Button: ({
    children,
    disabled,
    onClick,
  }: {
    children: React.ReactNode;
    disabled?: boolean;
    onClick?: () => void;
  }) => (
    <button type="button" disabled={disabled} onClick={onClick}>
      {children}
    </button>
  ),
  Select: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <button type="button">{children}</button>,
  SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>,
  Textarea: ({
    value,
    onChange,
    disabled,
    placeholder,
  }: {
    value?: string;
    onChange?: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
    disabled?: boolean;
    placeholder?: string;
  }) => (
    <textarea value={value} onChange={onChange} disabled={disabled} placeholder={placeholder} />
  ),
}));

describe('ClaimActionPanel', () => {
  it('enables "Reassign to Me" when assigned to colleague', () => {
    render(
      <ClaimActionPanel
        claimId="claim-1"
        currentStatus="submitted"
        staffId="staff-me"
        assigneeId="staff-other"
      />
    );

    const button = screen.getByRole('button', { name: 'Reassign to Me' });
    expect(button).toBeEnabled();
  });
});
