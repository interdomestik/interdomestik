import { describe, expect, it } from 'vitest';
import { scrubSentryEvent, scrubSentrySpan } from './sentry-privacy';

describe('installed SDK browser responsiveness signals', () => {
  // SDK10.75 browser-utils metrics/inp.js maps interaction names to these four fixed values.
  // metrics/browserMetrics.js emits the two fixed main-thread blocking operations.
  it.each([
    'ui.interaction.click',
    'ui.interaction.hover',
    'ui.interaction.drag',
    'ui.interaction.press',
    'ui.long-task',
    'ui.long-animation-frame',
  ])('retains fixed %s and numeric timing without element selectors or private metadata', op => {
    const result = scrubSentrySpan({
      trace_id: 'trace',
      span_id: 'span',
      op,
      start_timestamp: 1,
      timestamp: 1.25,
      exclusive_time: 250,
      origin: op.startsWith('ui.interaction.')
        ? 'auto.http.browser.inp'
        : 'auto.ui.browser.metrics',
      description: 'button#private-claim[data-email="private"]',
      data: {
        'sentry.exclusive_time': 250,
        'browser.web_vital.inp.value': 250,
        'ui.component_name': 'private',
        'code.filepath': 'https://private.test/claim',
        user: 'private',
      },
      measurements: { inp: { value: 250, unit: 'millisecond' } },
    });
    expect(result).toMatchObject({
      op,
      start_timestamp: 1,
      timestamp: 1.25,
      exclusive_time: 250,
      description: '[redacted]',
      measurements: { inp: { value: 250, unit: 'millisecond' } },
      data: { 'sentry.exclusive_time': 250, 'browser.web_vital.inp.value': 250 },
    });
    expect(JSON.stringify(result)).not.toContain('private');
    expect(result.origin).toBe(
      op.startsWith('ui.interaction.') ? 'auto.http.browser.inp' : 'auto.ui.browser.metrics'
    );
  });
  it('preserves default legacy INP measurement encoding and rejects unknown operation/origin strings', () => {
    // SDK inp.js adds the inp event with numeric sentry.measurement_value + millisecond unit;
    // core tracing/measurement.js serializes it to this measurements.inp representation.
    expect(
      scrubSentryEvent({
        type: 'transaction',
        measurements: { inp: { value: 250, unit: 'millisecond' } },
      })?.measurements
    ).toEqual({ inp: { value: 250, unit: 'millisecond' } });
    const span = scrubSentrySpan({
      trace_id: 'trace',
      span_id: 'span',
      start_timestamp: 1,
      op: 'ui.interaction.private-claim',
      origin: 'auto.private-claim',
      data: { 'browser.web_vital.inp.value': NaN },
    });
    expect(span.op).toBe('diagnostic');
    expect(span.origin).toBeUndefined();
    expect(span.data).toEqual({});
  });
});
