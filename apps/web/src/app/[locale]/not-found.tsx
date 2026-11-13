import { BrandedNotFoundFrame } from '@/components/branded-not-found';
import { LocaleNotFoundCopy } from './locale-not-found-copy';

// A server boundary, so the contractual markers (`not-found-page`, `locale-not-found`) are part of
// the streamed response itself. It never calls next-intl server APIs: without a route locale they
// fall back to the default and cache that request config (qa3 #67). Only the copy is a client child.
export default function NotFound(): React.JSX.Element {
  return (
    <BrandedNotFoundFrame scope="locale">
      <LocaleNotFoundCopy />
    </BrandedNotFoundFrame>
  );
}
