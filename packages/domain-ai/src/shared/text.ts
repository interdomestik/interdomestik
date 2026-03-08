function isDigit(value: string) {
  return value >= '0' && value <= '9';
}

export function normalizeText(value: string | null | undefined) {
  return (value ?? '').replaceAll(/\s+/g, ' ').trim();
}

export function toIsoDate(value: Date | string | null | undefined) {
  if (!value) return null;

  if (typeof value === 'string' && value.length === 10) {
    const [year3, year2, year1, year0, dash0, month1, month0, dash1, day1, day0] = value;
    if (
      isDigit(year3 ?? '') &&
      isDigit(year2 ?? '') &&
      isDigit(year1 ?? '') &&
      isDigit(year0 ?? '') &&
      dash0 === '-' &&
      isDigit(month1 ?? '') &&
      isDigit(month0 ?? '') &&
      dash1 === '-' &&
      isDigit(day1 ?? '') &&
      isDigit(day0 ?? '')
    ) {
      return value;
    }
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString().slice(0, 10);
}

export function extractFirstIsoLikeDate(text: string) {
  for (let index = 0; index <= text.length - 10; index += 1) {
    const year = text.slice(index, index + 4);
    const firstSeparator = text[index + 4];
    const month = text.slice(index + 5, index + 7);
    const secondSeparator = text[index + 7];
    const day = text.slice(index + 8, index + 10);

    if (
      year.length !== 4 ||
      !year.split('').every(isDigit) ||
      year[0] !== '2' ||
      (firstSeparator !== '-' && firstSeparator !== '/') ||
      month.length !== 2 ||
      !month.split('').every(isDigit) ||
      secondSeparator !== firstSeparator ||
      day.length !== 2 ||
      !day.split('').every(isDigit)
    ) {
      continue;
    }

    return `${year}-${month}-${day}`;
  }

  return null;
}
