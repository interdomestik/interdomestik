import {
  failInformationRequestRead,
  type ReadResultTarget,
} from '../../e2e/gate/information-request-read-result.fixture';

export const TARGET: ReadResultTarget = {
  audience: 'staff',
  claimId: 's4-case-a',
  pathname: '/sq/staff/claims/s4-case-a',
};

export const row = (id: string, value: unknown): string => `${id}:${JSON.stringify(value)}`;
export const props = (overrides: Record<string, unknown> = {}) => ({
  audience: 'staff',
  claimId: 's4-case-a',
  requests: [{ id: 'req-1', note: 'secret-note' }],
  locale: 'sq',
  ...overrides,
});
export const OTHER = props({ claimId: 's4-other', requests: [{ id: 'req-other' }] });
export const element = (value: unknown) => ['$', 'section', null, value];
export const tree = (...children: unknown[]) => [
  '$',
  'div',
  null,
  { children: children.map(element) },
];

// Observed Next RSC framing: JSON records, import/hint/text rows, a non-JSON row, trailing newline.
export function sample(candidate: unknown = props()): string {
  return [
    row('0', { a: '$@1', f: '', q: '', i: false }),
    '1:I["chunk",["static/a.js"],"default"]',
    row('2', tree(candidate, OTHER)),
    '3:T5,hello',
    '4:{not-json',
    ':HL["/a.css","style"]',
    '',
  ].join('\n');
}

export function failureOf(
  body: string,
  run: (body: string, target: ReadResultTarget) => unknown = failInformationRequestRead
): string {
  try {
    run(body, TARGET);
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error('expected the transformer to throw');
}
