import { describe, expect, it } from 'vitest';
import {
  failInformationRequestRead,
  verifyEmptyInformationRequestRead,
} from '../../e2e/gate/information-request-read-result.fixture';
import {
  TARGET,
  row,
  props,
  OTHER,
  element,
  tree,
  sample,
  failureOf,
} from './information-request-read-result-test-support';

describe('failInformationRequestRead', () => {
  it('nulls only requests of the exact audience and claim and keeps framing byte-exact', () => {
    const input = sample();
    const output = failInformationRequestRead(input, TARGET);
    const before = input.split('\n');
    const after = output.split('\n');
    expect(after).toHaveLength(before.length);
    expect(after.flatMap((line, index) => (line === before[index] ? [] : [index]))).toEqual([2]);
    expect(output.endsWith('\n')).toBe(true);
    const rewritten: unknown = JSON.parse((after[2] ?? '').slice(2));
    expect(rewritten).toEqual(tree({ ...props(), requests: null }, OTHER));
    expect(output).not.toContain('secret-note');
    expect(output).toContain('req-other');
  });

  it('is idempotent when the read is already null', () => {
    const input = sample(props({ requests: null }));
    expect(failInformationRequestRead(input, TARGET)).toBe(input);
  });

  it('preserves CRLF framing of the rewritten row and the rows after it', () => {
    const input = `${row('2', tree(props(), OTHER))}\r\n3:T5,hello\r\n`;
    const output = failInformationRequestRead(input, TARGET);
    expect(output.split('\n')[0]?.endsWith('\r')).toBe(true);
    expect(output.endsWith('\r\n3:T5,hello\r\n')).toBe(true);
    expect(output).not.toContain('secret-note');
  });

  it.each([
    ['claim', props({ claimId: 's4-wrong' })],
    ['audience', props({ audience: 'member' })],
    ['requests shape', props({ requests: 'oops' })],
    ['requests presence', { audience: 'staff', claimId: 's4-case-a' }],
  ])('throws payload-free when the %s does not match', (_name, candidate) => {
    const message = failureOf(sample(candidate));
    expect(message).toContain('found 0');
    expect(message).not.toContain('secret-note');
  });

  it('throws when the match is ambiguous', () => {
    const twoRows = [row('0', element(props())), row('1', element(props()))].join('\n');
    const oneRow = row('0', tree(props(), props()));
    for (const body of [twoRows, oneRow]) expect(failureOf(body)).toContain('found 2');
  });

  it('rejects nested matching props as ambiguous', () => {
    expect(failureOf(sample(props({ children: props() })))).toContain('found 2');
  });

  it('throws when no record carries the props', () => {
    const bodies = ['', '1:I["chunk",[],"default"]\n3:T5,hello', row('0', { a: 1 })];
    for (const body of bodies) expect(failureOf(body)).toContain('found 0');
  });
});

describe('verifyEmptyInformationRequestRead', () => {
  it('accepts exactly one target props object with an empty requests list', () => {
    const body = sample(props({ requests: [] }));
    expect(() => verifyEmptyInformationRequestRead(body, TARGET)).not.toThrow();
  });

  it.each([
    ['populated', props()],
    ['failed', props({ requests: null })],
  ])('rejects a %s read without leaking the payload', (_name, candidate) => {
    const message = failureOf(sample(candidate), verifyEmptyInformationRequestRead);
    expect(message).toContain('empty');
    expect(message).not.toContain('secret-note');
  });

  it.each([
    ['missing', sample(props({ claimId: 's4-wrong', requests: [] })), 'found 0'],
    ['ambiguous', row('0', tree(props({ requests: [] }), props({ requests: [] }))), 'found 2'],
  ])('rejects a %s target', (_name, body, found) => {
    expect(failureOf(body, verifyEmptyInformationRequestRead)).toContain(found);
  });
});
