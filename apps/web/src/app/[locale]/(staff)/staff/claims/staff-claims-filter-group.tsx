import { OUTLINED_LINK, PRIMARY_LINK } from '@/components/dashboard/member-portal-link-styles';
import { Link } from '@/i18n/routing';
import { Check } from 'lucide-react';
import type { MouseEvent } from 'react';

export type FilterOption = Readonly<{
  href: string;
  isActive: boolean;
  label: string;
  testId: string;
  value: string;
}>;

type Props = Readonly<{
  isPending: boolean;
  label: string;
  labelId: string;
  onNavigate: (event: MouseEvent<HTMLAnchorElement>, option: FilterOption) => void;
  options: readonly FilterOption[];
  testId: string;
}>;

export function StaffClaimsFilterGroup({
  isPending,
  label,
  labelId,
  onNavigate,
  options,
  testId,
}: Props) {
  return (
    <div aria-labelledby={labelId} className="space-y-2" data-testid={testId} role="group">
      <p className="text-sm font-semibold" id={labelId}>
        {label}
      </p>
      <div className="flex flex-wrap gap-2">
        {options.map(option => {
          const isDisabled = isPending || option.isActive;
          const linkStyle = option.isActive
            ? `${PRIMARY_LINK} forced-colors:border-[Highlight]`
            : OUTLINED_LINK;

          return (
            <Link
              key={option.value}
              href={option.href}
              aria-current={option.isActive ? 'true' : undefined}
              aria-disabled={isDisabled ? 'true' : undefined}
              className={`${linkStyle} scroll-my-24 aria-disabled:cursor-default`}
              onClick={event => onNavigate(event, option)}
              prefetch={false}
              data-testid={option.testId}
              tabIndex={isDisabled ? -1 : undefined}
            >
              {option.isActive && <Check aria-hidden="true" className="size-4 shrink-0" />}
              <span className="min-w-0">{option.label}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
