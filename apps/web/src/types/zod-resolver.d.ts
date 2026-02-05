// Type shim for zod v4 compatibility with @hookform/resolvers.
declare module '@hookform/resolvers/zod' {
  import type { Resolver } from 'react-hook-form';
  import type { ZodTypeAny } from 'zod';

  export function zodResolver(
    schema: ZodTypeAny,
    schemaOptions?: unknown,
    resolverOptions?: unknown
  ): Resolver<any>;
}
