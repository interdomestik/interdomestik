import * as fs from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import {
  canonicalJson,
  must,
  readBoundedRegularText as readText,
  sha256,
} from './slice-rehearse-canonical.mjs';
import { runRecoveryOperation } from './slice-rehearse-operation-recovery.mjs';
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

export const HOST_BOUND_AUTHORITY_ROOT = resolve(homedir(), '.codex/state/interdomestik');
const APPROVAL_ROOT = resolve(HOST_BOUND_AUTHORITY_ROOT, 'harness-approvals');
const SLICE = /^[A-Z0-9][A-Z0-9-]{1,63}$/u;
const OPEN = fs.constants;
export {
  HEAVY_PROOF_LEDGER_ROOT,
  heavyProofLedgerPath,
  trustedHeavyProofLedgerPath,
  normalizeHeavyProofExecution,
  recordHeavyProofExecution,
  acquireHeavyProofExecutionLease,
  readHeavyProofRecords,
} from './slice-rehearse-proof-ledger.mjs';

function secureRoot(root, label, optional = false) {
  if (!fs.existsSync(root)) {
    must(optional, `${label} is unavailable`);
    return false;
  }
  const stat = fs.lstatSync(root);
  const secure =
    stat.isDirectory() &&
    !stat.isSymbolicLink() &&
    (stat.mode & 0o777) === 0o700 &&
    stat.uid === process.getuid();
  must(secure, `${label} root is unsafe`);
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
    flag: OPEN.O_WRONLY | OPEN.O_CREAT | OPEN.O_EXCL | OPEN.O_NOFOLLOW,
    mode: 0o600,
  });
  return marker;
}

export function readTrustedApprovalCount(sliceId, root = APPROVAL_ROOT) {
  must(SLICE.test(sliceId), 'approval slice ID is invalid');
  if (!secureRoot(root, 'approval receipt', true)) return 0;
  const prefix = `${sliceId}-DELIVERY-`;
  const receipts = fs
    .readdirSync(root)
    .filter(
      name =>
        name.startsWith(prefix) &&
        /^[1-9]\d*-[0-9a-f]{64}\.receipt$/u.test(name.slice(prefix.length))
    );
  must(receipts.length <= 1, 'repeated delivery approval receipt is invalid');
  for (const name of receipts) readReceipt(resolve(root, name), root);
  return receipts.length;
}

export function runSafeOperation(
  request,
  {
    readLiveFacts = readLiveOperationFacts,
    readAuthority = readLiveOperationAuthority,
    execute = executeOperation,
    reconcile = reconcileOperation,
    root,
    recovery,
  } = {}
) {
  const command = buildSafeOperation(request);
  const cert = command.certificate;
  if (recovery !== undefined)
    return runRecoveryOperation(request, command, {
      recovery,
      root: root ?? APPROVAL_ROOT,
      reconcile,
      verifyApproval: approved => verifyTrustedApprovalReceipt(approved, root),
      verifyCurrent: () => {
        verifyLiveOperationFacts(readLiveFacts(request, cert), cert, request.operation);
        verifyOperationAuthority(readAuthority(command.boundary, cert), cert);
        verifyOperationBody(request, cert);
      },
    });
  verifyTrustedApprovalReceipt(cert, root);
  verifyLiveOperationFacts(readLiveFacts(request, cert), cert, request.operation);
  verifyOperationAuthority(readAuthority(command.boundary, cert), cert);
  verifyOperationBody(request, cert);
  const mark = consumeApprovedOperation(request, cert, root);
  const result = execute(command.binary, command.args);
  const reconciliation = reconcile(request, cert);
  must(
    ['applied', 'not_applied', 'unknown'].includes(reconciliation?.outcome),
    'mutation reconciliation outcome is invalid'
  );
  if (result.status !== 0 && reconciliation.outcome === 'not_applied') fs.unlinkSync(mark);
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
