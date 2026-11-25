const CUTOFF_HOUR = 16;
const skopjeClock = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Skopje',
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

// Represent Skopje wall time on the UTC calendar for date arithmetic.
function skopjeWallTime(instant: Date): Date {
  const { year, month, day, hour, minute, second } = Object.fromEntries(
    skopjeClock.formatToParts(instant).map(part => [part.type, part.value])
  );
  const wallTime = new Date(0);
  wallTime.setUTCFullYear(Number(year), Number(month) - 1, Number(day));
  wallTime.setUTCHours(Number(hour), Number(minute), Number(second));
  return wallTime;
}

function isWeekend(day: Date): boolean {
  return day.getUTCDay() === 0 || day.getUTCDay() === 6;
}

function advanceToNextWeekday(day: Date): void {
  do {
    day.setUTCDate(day.getUTCDate() + 1);
  } while (isWeekend(day));
}

export function serviceLevelDeadline(requestedAt: Date): Date {
  const day = skopjeWallTime(requestedAt);
  if (isWeekend(day) || day.getUTCHours() >= CUTOFF_HOUR) {
    advanceToNextWeekday(day);
  }
  advanceToNextWeekday(day);
  day.setUTCHours(CUTOFF_HOUR, 0, 0, 0);

  // Look up the offset at the deadline so a weekend clock change is accounted for.
  const offsetMs = skopjeWallTime(day).getTime() - day.getTime();
  return new Date(day.getTime() - offsetMs);
}

export function answeredOnTime(requestedAt: Date, answeredAt: Date | null): boolean {
  return answeredAt !== null && answeredAt.getTime() <= serviceLevelDeadline(requestedAt).getTime();
}
