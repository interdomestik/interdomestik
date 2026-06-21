import { describe, expect, it } from 'vitest';

import { createDocumentExtractionAiContext } from './test-helpers/ai-call-context';
import { createAiClient } from './client';

describe('createAiClient', () => {
  it('rejects missing context before checking provider configuration', () => {
    expect(() =>
      // @ts-expect-error T-404 runtime guard rejects missing context.
      createAiClient(undefined)
    ).toThrow(/AI call context is required: context_missing/);
  });

  it('rejects null context before checking provider configuration', () => {
    expect(() =>
      // @ts-expect-error T-404 runtime guard rejects null context.
      createAiClient(null)
    ).toThrow(/context_missing/);
  });

  it('rejects structurally invalid context before checking provider configuration', () => {
    expect(() =>
      // @ts-expect-error T-404 runtime guard rejects structurally invalid context.
      createAiClient({ workflowId: 'claim_intake_extract' })
    ).toThrow(/tenant_id_missing/);
  });

  it('checks provider configuration after accepting a valid context', () => {
    const previousApiKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;

    try {
      expect(() => createAiClient(createDocumentExtractionAiContext())).toThrow(
        /OPENAI_API_KEY is required/
      );
    } finally {
      if (previousApiKey === undefined) {
        delete process.env.OPENAI_API_KEY;
      } else {
        process.env.OPENAI_API_KEY = previousApiKey;
      }
    }
  });
});
