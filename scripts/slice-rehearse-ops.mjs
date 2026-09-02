import * as fs from 'node:fs';
import { resolve } from 'node:path';
import {
  canonicalJson,
  must,
  readBoundedRegularText as readText,
  sha256,
} from './slice-rehearse-canonical.mjs';
import { trustedRunnerFile } from './ci/trusted-runner-file.mjs';
import { buildSafeOperation } from './slice-rehearse-operation-certificate.mjs';
import {
  executeOperation,
  readLiveOperationAuthority,
  readLiveOperationFacts,
  reconcileOperation,
  verifyLiveOperationFacts,
  verifyOperationAuthority,
  verifyOperationBody,
} from './slice-rehearse-operation-live.mjs';

export { buildSafeOperation } from './slice-rehearse-operation-certificate.mjs';

export const HOST_BOUND_AUTHORITY_ROOT = '/Users/arbenlila/.codex/state/interdomestik'; // Not a cross-host contract.
const APPROVAL_ROOT = resolve(HOST_BOUND_AUTHORITY_ROOT, 'harness-approvals');
const [SLICE, SHA] = [/^[A-Z0-9][A-Z0-9-]{1,63}$/u, /^[0-9a-f]{40}$/u];
export const HEAVY_PROOF_LEDGER_ROOT = resolve(HOST_BOUND_AUTHORITY_ROOT, 'harness-proof-ledgers');

function secureRoot(root, label, optional = false) {
  if (!fs.existsSync(root)) {
    must(optional, `${label} is unavailable`);
    return false;
  }
  const stat = fs.lstatSync(root);
  const secureType = stat.isDirectory() && !stat.isSymbolicLink();
  const secureMode = (stat.mode & 0o777) === 0o700 && stat.uid === process.getuid();
  must(secureType && secureMode, `${label} root is unsafe`);
  return true;
}

export function approvalReceiptPath(certificate, root = APPROVAL_ROOT) {
  return resolve(
    root,
    `${certificate.approvalEnvelopeId}-${certificate.approvalBindingSha256}.receipt`
  );
}

const readReceipt = (path, root) =>
  readText(path, { label: 'Trusted approval receipt', maxBytes: 64 * 1024, allowedRoots: [root] });

export function verifyTrustedApprovalReceipt(certificate, root = APPROVAL_ROOT) {
  secureRoot(root, 'approval receipt');
  const bytes = readReceipt(approvalReceiptPath(certificate, root), root);
  must(sha256(bytes) === certificate.approvalReceiptSha256, 'approval receipt digest differs');
  return true;
}

export function consumeApprovedOperation(request, certificate, root = APPROVAL_ROOT) {
  secureRoot(root, 'approval receipt');
  const requestSha256 = sha256(canonicalJson(request));
  const marker = `${approvalReceiptPath(certificate, root)}.${requestSha256}.consumed`;
  fs.writeFileSync(marker, `${requestSha256}\n`, {
    flag:
      fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW,
    mode: 0o600,
  });
  return marker;
}

export function readTrustedApprovalCount(sliceId, root = APPROVAL_ROOT) {
  must(SLICE.test(sliceId), 'approval slice ID is invalid');
  if (!secureRoot(root, 'approval receipt', true)) return 0;
  const pattern = new RegExp(`^${sliceId}-DELIVERY-[1-9]\\d*-[0-9a-f]{64}\\.receipt$`, 'u');
  const receipts = fs.readdirSync(root).filter(name => pattern.test(name));
  must(receipts.length <= 1, 'repeated delivery approval receipt is invalid');
  for (const name of receipts) readReceipt(resolve(root, name), root);
  return receipts.length;
}

export function heavyProofLedgerPath(scope, root = HEAVY_PROOF_LEDGER_ROOT) {
  must(SLICE.test(scope?.sliceId ?? ''), 'heavy proof slice ID is invalid');
  must(SHA.test(scope?.headSha ?? ''), 'heavy proof head SHA is invalid');
  must(SHA.test(scope?.treeSha ?? ''), 'heavy proof tree SHA is invalid');
  const file = `${scope.sliceId}-${scope.headSha}-${scope.treeSha}.jsonl`;
  return resolve(root, file);
}

export function trustedHeavyProofLedgerPath(ledgerPath, scope, root = HEAVY_PROOF_LEDGER_ROOT) {
  const expected = heavyProofLedgerPath(scope, root);
  must(
    resolve(ledgerPath) === expected,
    'heavy proof ledger is outside the canonical evidence scope'
  );
  if (!fs.existsSync(root)) fs.mkdirSync(root, { mode: 0o700 });
  secureRoot(root, 'heavy proof ledger');
  return trustedRunnerFile(expected, { runnerTemp: root });
}

export function runSafeOperation(
  request,
  {
    readLiveFacts = readLiveOperationFacts,
    readAuthority = readLiveOperationAuthority,
    execute = executeOperation,
    reconcile = reconcileOperation,
  } = {}
) {
  const command = buildSafeOperation(request);
  verifyTrustedApprovalReceipt(command.certificate);
  verifyLiveOperationFacts(
    readLiveFacts(request, command.certificate),
    command.certificate,
    request.operation
  );
  verifyOperationAuthority(
    readAuthority(command.boundary, command.certificate),
    command.certificate
  );
  verifyOperationBody(request, command.certificate);
  consumeApprovedOperation(request, command.certificate);
  const result = execute(command.binary, command.args);
  const reconciliation = reconcile(request, command.certificate);
  must(
    ['applied', 'not_applied', 'unknown'].includes(reconciliation?.outcome),
    'mutation reconciliation outcome is invalid'
  );
  if (result.status === 0) {
    must(
      reconciliation.outcome === 'applied',
      'successful mutation lacks an applied postcondition'
    );
    return { status: 'succeeded', command, reconciliation };
  }
  return {
    status: `failed_${reconciliation.outcome}`,
    command,
    reconciliation,
    error: typeof result.stderr === 'string' ? result.stderr.trim() : null,
  };
}
