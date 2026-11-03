// Public surface of ingress capabilities: the cron admission check and the capability type.
// Minting a capability directly is reserved to the fixed callers of ingress-registrar.ts.
export { admitCronRequest, type IngressCapability, type IngressKind } from './ingress-capability';
