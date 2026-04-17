export function createActiveAnnualMembershipState(now: Date): {
  status: 'active';
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
} {
  const currentPeriodStart = now;
  const currentPeriodEnd = new Date(now);
  currentPeriodEnd.setFullYear(currentPeriodEnd.getFullYear() + 1);

  return {
    status: 'active',
    currentPeriodStart,
    currentPeriodEnd,
  };
}
