'use client';

import { readSavedDraftContinuation } from '@/lib/saved-draft-continuation';
import { useEffect, useRef, useState, type RefObject } from 'react';

export function useDraftContinuation(
  resume: (id: string) => Promise<boolean | undefined>,
  headingRef?: RefObject<HTMLHeadingElement | null>
) {
  const [state, setState] = useState<'initial' | 'loading' | 'error' | 'ready'>('initial');
  const target = useRef<string | null>(null);
  const started = useRef(false);
  const mounted = useRef(false);
  const pending = useRef(false);
  const resumeRef = useRef(resume);
  resumeRef.current = resume;

  async function retry() {
    if (!target.current || pending.current) return;
    pending.current = true;
    setState('loading');
    try {
      const accepted = await resumeRef.current(target.current);
      if (mounted.current) setState(accepted === true ? 'ready' : 'error');
    } catch {
      if (mounted.current) setState('error');
    } finally {
      pending.current = false;
    }
  }

  useEffect(() => {
    mounted.current = true;
    if (!started.current) {
      started.current = true;
      const hash = window.location.hash;
      target.current = readSavedDraftContinuation(hash);
      if (target.current) void retry();
      else setState(hash.startsWith('#draft=') ? 'error' : 'ready');
    }
    return () => {
      mounted.current = false;
    };
    // Only the initial selection may restore facts; later edits and hash changes cannot overwrite them.
  }, []);

  useEffect(() => {
    if (state === 'ready' && target.current) headingRef?.current?.focus();
  }, [state, headingRef]);

  return { blocked: state !== 'ready', canRetry: Boolean(target.current), retry, state };
}
