import enBase from './en/freeStart.json';
import enResult from './en/freeStartResult.json';
import enEvidence from './en/freeStartResultEvidence.json';
import mkBase from './mk/freeStart.json';
import mkResult from './mk/freeStartResult.json';
import mkEvidence from './mk/freeStartResultEvidence.json';
import sqBase from './sq/freeStart.json';
import sqResult from './sq/freeStartResult.json';
import sqEvidence from './sq/freeStartResultEvidence.json';
import srBase from './sr/freeStart.json';
import srResult from './sr/freeStartResult.json';
import srEvidence from './sr/freeStartResultEvidence.json';

function mergeResultMessages<
  Base extends { freeStart: Record<string, unknown> },
  Result extends { freeStart: { result: Record<string, unknown> } },
  Evidence extends { freeStart: { result: { evidence: Record<string, unknown> } } },
>(base: Base, result: Result, evidence: Evidence) {
  return {
    ...base,
    freeStart: {
      ...base.freeStart,
      result: {
        ...result.freeStart.result,
        ...evidence.freeStart.result,
      },
    },
  };
}

export const enFreeStartMessages = mergeResultMessages(enBase, enResult, enEvidence);
export const mkFreeStartMessages = mergeResultMessages(mkBase, mkResult, mkEvidence);
export const sqFreeStartMessages = mergeResultMessages(sqBase, sqResult, sqEvidence);
export const srFreeStartMessages = mergeResultMessages(srBase, srResult, srEvidence);

export const freeStartLocaleMessages = {
  en: enFreeStartMessages,
  mk: mkFreeStartMessages,
  sq: sqFreeStartMessages,
  sr: srFreeStartMessages,
} as const;
