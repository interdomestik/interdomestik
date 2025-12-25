// Schema index - re-exports all tables, enums, and relations
// This modular structure keeps each file under 150 lines

// Enums
export * from './enums';

// Tables by domain
export * from './agents';
export * from './auth';
export * from './automation';
export * from './claims';
export * from './crm';
export * from './memberships';
export * from './notes';
export * from './notifications';
export * from './services';
export * from './webhooks';

// Relations
export * from './relations';
