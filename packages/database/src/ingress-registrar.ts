// Direct ingress minting for entries whose authentication happens outside this package: the
// Inngest handlers (invoked only through the signed serve endpoint) and the Paddle signature
// verifier. The db-access guard refuses any other import, alias or re-export of this module.
export { mintIngressCapability } from './ingress-capability';
