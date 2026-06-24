import type { CountryHostAliasLabel, TenantId } from './tenant-host-aliases';

export type TenantResolutionSource =
  | 'compatibility_alias'
  | 'cookie'
  | 'header'
  | 'query'
  | 'default_public'
  | 'ida_front_door';

export type TenantResolutionResult =
  | {
      kind: 'tenant';
      tenantId: TenantId;
      source: Exclude<TenantResolutionSource, 'ida_front_door'>;
      defaultBookingTenantId?: TenantId;
      hostAlias?: CountryHostAliasLabel;
    }
  | {
      kind: 'public';
      tenantId: null;
      source: 'ida_front_door';
    };
