import { describe, expect, it } from 'vitest';
import { answeredOnTime, serviceLevelDeadline } from './service-level';

describe('serviceLevelDeadline', () => {
  it.each([
    ['Friday at 15:59', '2026-11-20T15:59:00+01:00', '2026-11-23T16:00:00+01:00'],
    ['Friday at 16:00', '2026-11-20T16:00:00+01:00', '2026-11-24T16:00:00+01:00'],
    ['Friday at 16:01', '2026-11-20T16:01:00+01:00', '2026-11-24T16:00:00+01:00'],
    ['Saturday', '2026-11-21T10:00:00+01:00', '2026-11-24T16:00:00+01:00'],
    ['Sunday', '2026-11-22T10:00:00+01:00', '2026-11-24T16:00:00+01:00'],
    ['Monday before opening', '2026-11-23T00:00:00+01:00', '2026-11-24T16:00:00+01:00'],
    ['Friday before spring DST', '2026-03-27T15:59:00+01:00', '2026-03-30T16:00:00+02:00'],
    ['Monday after spring DST', '2026-03-30T16:00:00+02:00', '2026-04-01T16:00:00+02:00'],
    ['Friday before autumn DST', '2026-10-23T15:59:00+02:00', '2026-10-26T16:00:00+01:00'],
    ['Monday after autumn DST', '2026-10-26T16:00:00+01:00', '2026-10-28T16:00:00+01:00'],
  ])('assigns the deadline for a request on %s', (_label, request, deadline) => {
    expect(serviceLevelDeadline(new Date(request))).toEqual(new Date(deadline));
  });
});

describe('answeredOnTime', () => {
  const friday = new Date('2026-11-20T15:59:00+01:00');

  it.each([
    ['2026-11-23T15:59:00+01:00', true],
    ['2026-11-23T16:00:00+01:00', true],
    ['2026-11-23T16:01:00+01:00', false],
  ])('checks a Monday answer at %s', (answer, expected) => {
    expect(answeredOnTime(friday, new Date(answer))).toBe(expected);
  });

  it('returns false for an unanswered request', () => {
    expect(answeredOnTime(friday, null)).toBe(false);
  });
});
