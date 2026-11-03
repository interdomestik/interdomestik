// The one minting entry outside packages/database. Its callers are a fixed, reviewed list (the
// request-session producer in apps/web and the seed CLI); the db-access guard refuses any other
// import, alias or re-export of it. Producers inside packages/database import the internal module.
export { mintTenantAuthority, type TenantAuthorityGrant } from './tenant-authority';
