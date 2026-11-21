const skopjeCalendar = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Skopje',
  numberingSystem: 'latn',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function skopjeDate(instant: Date): string {
  const { day, month, year } = Object.fromEntries(
    skopjeCalendar.formatToParts(instant).map(part => [part.type, part.value])
  );
  return `${year.padStart(4, '0')}-${month}-${day}`;
}

/** The last covered civil day, one day before the clamped anniversary. */
export function addMembershipYear(startsOn: string): string {
  const date = new Date(`${startsOn}T00:00:00.000Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(startsOn) ||
    Number.isNaN(date.getTime()) ||
    !date.toISOString().startsWith(`${startsOn}T`) ||
    date.getUTCFullYear() === 0
  ) {
    throw new RangeError('Expected a calendar date in YYYY-MM-DD');
  }
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  const anniversaryDay = month === 1 && day === 29 ? 28 : day;
  date.setUTCFullYear(date.getUTCFullYear() + 1, month, anniversaryDay - 1);
  const [endsOn] = date.toISOString().split('T');
  if (endsOn.length !== 10) throw new RangeError('Membership end is outside YYYY-MM-DD');
  return endsOn;
}
