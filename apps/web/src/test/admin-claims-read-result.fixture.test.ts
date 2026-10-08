import { describe, expect, it } from 'vitest';
import {
  ADMIN_CLAIMS_READ,
  AdminClaimsReadSeamError,
  classifyRead,
  failAdminClaimsRead,
  readAdminClaimsResult,
} from '../../e2e/gate/admin-claims-read-result.fixture';

// Pure projection coverage runs in the required unit-test lane.
const CANARY = 'canary-rows-do-not-print';
const FILTER = ['$', '$L5', null, {}];
const UNRELATED = ['0:I["chunk",[],"default"]', ':HL["/a.css","style"]', '3:"text row"'];

function resultOutput(text: string, testId: string = ADMIN_CLAIMS_READ.resultTestId) {
  const props = {
    'aria-live': 'polite',
    'data-testid': testId,
    className: 'sr-only',
    children: text,
  };
  return ['$', 'output', null, props];
}

function recoveryProps(overrides: Record<string, unknown> = {}) {
  return {
    message: null,
    headingId: ADMIN_CLAIMS_READ.headingId,
    regionTestId: ADMIN_CLAIMS_READ.regionTestId,
    recoveryTestId: ADMIN_CLAIMS_READ.recoveryTestId,
    children: [FILTER, resultOutput('Claims found: 3.'), ['$', 'div', null, { children: CANARY }]],
    ...overrides,
  };
}

function flight(...props: unknown[]): string {
  const records = props.map((value, i) => `${i + 1}:${JSON.stringify(['$', '$L9', null, value])}`);
  return [UNRELATED[0], ...records, UNRELATED[1], UNRELATED[2], '4:{not json', ''].join('\n');
}

function thrown(action: () => unknown): Error {
  try {
    action();
  } catch (error) {
    if (error instanceof Error) return error;
  }
  throw new Error('Expected the projection to throw');
}

describe('S7 admin claims read projection (pure)', () => {
  it('projects only the read and keeps the filter child, framing and other records', () => {
    const body = flight(recoveryProps());
    const failed = failAdminClaimsRead(body, 'Localized failure.');
    const before = body.split('\n');
    const after = failed.split('\n');
    expect(after).toHaveLength(before.length);
    after.forEach((line, index) => {
      if (index !== 1) expect(line).toBe(before[index]);
    });
    const projected = JSON.parse((after[1] ?? '').slice(2))[3];
    expect(projected).toMatchObject({
      message: 'Localized failure.',
      headingId: ADMIN_CLAIMS_READ.headingId,
      regionTestId: ADMIN_CLAIMS_READ.regionTestId,
      recoveryTestId: ADMIN_CLAIMS_READ.recoveryTestId,
    });
    expect(projected.children).toHaveLength(3);
    expect(projected.children[0]).toEqual(FILTER);
    expect(projected.children[1][1]).toBe('output');
    expect(projected.children[1][3]).toMatchObject({
      'data-testid': ADMIN_CLAIMS_READ.resultTestId,
      children: '',
    });
    expect(projected.children[2]).toBe(false);
    expect(failed).not.toContain(CANARY);
  });

  it('preserves the actual production Sentry filter instrumentation', () => {
    const filter = [
      '$',
      '$L5',
      null,
      {
        'data-sentry-element': 'AdminClaimsFilters',
        'data-sentry-source-file': 'AdminClaimsV2Page.tsx',
      },
    ];
    const body = flight(
      recoveryProps({
        children: [
          filter,
          resultOutput('Claims found: 3.'),
          ['$', 'div', null, { children: CANARY }],
        ],
      })
    );
    const failed = failAdminClaimsRead(body, 'Localized failure.');
    const projected = JSON.parse((failed.split('\n')[1] ?? '').slice(2))[3];
    expect(projected.children[0]).toEqual(filter);
    expect(readAdminClaimsResult(body)).toBe('Claims found: 3.');
    expect(failed).not.toContain(CANARY);
  });

  it('reads the announced result of exactly one successful target', () => {
    expect(readAdminClaimsResult(flight(recoveryProps()))).toBe('Claims found: 3.');
  });

  const rows = ['$', 'div', null, { children: CANARY }];
  const withChildren = (children: unknown[]) => flight(recoveryProps({ children }));
  const rejected: [string, string][] = [
    ['no target', flight({ unrelated: CANARY })],
    ['two records', flight(recoveryProps(), recoveryProps())],
    ['nested duplicate', withChildren([FILTER, resultOutput('x'), [recoveryProps()]])],
    ['already failed', flight(recoveryProps({ message: CANARY }))],
    ['wrong child count', withChildren([FILTER, resultOutput('x')])],
    ['filter with props', withChildren([['$', '$L5', null, { a: 1 }], resultOutput('x'), rows])],
    [
      'wrong filter instrumentation',
      withChildren([
        [
          '$',
          '$L5',
          null,
          { 'data-sentry-element': 'Other', 'data-sentry-source-file': 'AdminClaimsV2Page.tsx' },
        ],
        resultOutput('x'),
        rows,
      ]),
    ],
    ['wrong output id', withChildren([FILTER, resultOutput('x', 'other'), rows])],
    ['blank announcement', withChildren([FILTER, resultOutput('  '), rows])],
    ['missing success content', withChildren([FILTER, resultOutput('x'), false])],
  ];
  for (const [label, body] of rejected) {
    it(`rejects ${label} without printing the payload`, () => {
      for (const action of [
        () => failAdminClaimsRead(body, 'Localized failure.'),
        () => readAdminClaimsResult(body),
      ]) {
        const error = thrown(action);
        expect(error).toBeInstanceOf(AdminClaimsReadSeamError);
        expect(error.message).not.toContain(CANARY);
        expect(error.message).toMatch(/^S7 admin claims read seam: /);
      }
    });
  }

  it('rejects an empty failure message before any projection', () => {
    expect(thrown(() => failAdminClaimsRead(flight(recoveryProps()), ' '))).toBeInstanceOf(
      AdminClaimsReadSeamError
    );
  });

  it('classifies only non-prefetch RSC GETs as reads', () => {
    const rsc = { rsc: '1' };
    expect(classifyRead('GET', rsc)).toBe('read');
    expect(classifyRead('GET', { ...rsc, 'next-router-prefetch': '1' })).toBe('prefetch');
    expect(classifyRead('GET', { ...rsc, 'next-router-segment-prefetch': '/_tree' })).toBe(
      'prefetch'
    );
    expect(classifyRead('POST', rsc)).toBe('ignore');
    expect(classifyRead('GET', {})).toBe('ignore');
    expect(classifyRead('GET', { rsc: '0' })).toBe('ignore');
  });
});
