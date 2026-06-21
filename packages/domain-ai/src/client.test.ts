import { describe, expect, it } from 'vitest';

import { createDocumentExtractionAiContext } from './test-helpers/ai-call-context';
import { createAiClient } from './client';

describe('createAiClient', () => {
  it('rejects missing context before checking provider configuration', () => {
    expect(() => createAiClient(undefined as never)).toThrow(
      /AI call context is required: context_missing/
    );
  });

  it('rejects null context before checking provider configuration', () => {
    expect(() => createAiClient(null as never)).toThrow(/context_missing/);
  });

  it('rejects structurally invalid context before checking provider configuration', () => {
    expect(() => createAiClient({ workflowId: 'claim_intake_extract' } as never)).toThrow(
      /tenant_id_missing/
    );
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
