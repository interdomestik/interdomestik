import { Fragment } from 'react';

type HandoffMember = Readonly<{
  name: string;
  memberNumber: string | null;
  email: string | null;
}>;

type EmailSegment = Readonly<{ start: number; text: string }>;

/** Splits after "@" and after each "." of the domain: the only places the address may wrap. */
export function emailBreakSegments(email: string): EmailSegment[] {
  const at = email.indexOf('@');
  if (at <= 0) return [{ start: 0, text: email }];
  const segments: EmailSegment[] = [{ start: 0, text: email.slice(0, at + 1) }];
  const labels = email.slice(at + 1).split('.');
  let start = at + 1;
  for (const [index, label] of labels.entries()) {
    const text = index < labels.length - 1 ? `${label}.` : label;
    segments.push({ start, text });
    start += text.length;
  }
  return segments;
}

/**
 * A member email in the queue's member column. Line-break opportunities after "@" and after each
 * domain "." let the address wrap at readable points when the column is narrow; the workspace's
 * break-anywhere rule is only a last resort for a segment that still cannot fit, so the row never
 * overflows. The queue grid keeps the column wide enough for a normal address from 1024 px.
 */
export function SupportHandoffMemberEmail({ email }: Readonly<{ email: string | null }>) {
  return (
    <div
      className="text-xs text-muted-foreground"
      data-testid="staff-support-handoff-member-email"
      title={email ?? undefined}
    >
      {email
        ? emailBreakSegments(email).map(segment => (
            <Fragment key={segment.start}>
              {segment.start > 0 ? <wbr /> : null}
              {segment.text}
            </Fragment>
          ))
        : null}
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
