type HandoffMember = Readonly<{
  name: string;
  memberNumber: string | null;
  email: string | null;
}>;

/**
 * A member email in the narrow queue column. The workspace lets long words break anywhere, so a
 * line-break opportunity after "@" keeps the address in two readable parts; only an address whose
 * part still cannot fit falls back to breaking inside it, which keeps the row free of overflow.
 */
export function SupportHandoffMemberEmail({ email }: Readonly<{ email: string | null }>) {
  const at = email ? email.indexOf('@') : -1;
  return (
    <div
      className="text-xs text-muted-foreground"
      data-testid="staff-support-handoff-member-email"
      title={email ?? undefined}
    >
      {at > 0 && email ? (
        <>
          {email.slice(0, at + 1)}
          <wbr />
          {email.slice(at + 1)}
        </>
      ) : (
        email
      )}
    </div>
  );
}

export function SupportHandoffMemberCell({
  member,
  noMemberNumberLabel,
}: Readonly<{ member: HandoffMember; noMemberNumberLabel: string }>) {
  return (
    <div>
      <div className="font-medium text-slate-900">{member.name}</div>
      <div className="text-xs text-muted-foreground">
        {member.memberNumber || noMemberNumberLabel}
      </div>
      <SupportHandoffMemberEmail email={member.email} />
    </div>
  );
}
