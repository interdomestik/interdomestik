import { cn } from '@/lib/utils';
import { LucideIcon } from 'lucide-react';

interface InfoPillProps {
  icon?: LucideIcon;
  label: string;
  value?: string | number | null;
  className?: string; // Wrapper class (+ bg/border colors)
  labelClassName?: string; // Text color/style
  separatorClassName?: string; // Divider color
  variant?: 'premium' | 'danger' | 'warning' | 'ghost'; // Presets
}

export function InfoPill({
  icon: Icon,
  label,
  value,
  className,
  labelClassName,
  separatorClassName,
  variant,
}: InfoPillProps) {
  // Variant Presets
  const presets = {
    premium: {
      wrapper: 'bg-white bg-slate-50 text-slate-600 border-slate-200 shadow-sm transition-all',
      separator: 'bg-slate-200',
    },
    danger: {
      wrapper: 'bg-red-50 text-red-700 border-red-200 shadow-sm transition-all',
      separator: 'bg-red-200',
    },
    warning: {
      wrapper: 'bg-orange-50 text-orange-700 border-orange-200 shadow-sm transition-all',
      separator: 'bg-orange-200',
    },
    ghost: {
      wrapper:
        'bg-transparent border-dashed border-slate-300 text-slate-500 hover:bg-slate-50 shadow-none',
      separator: 'bg-slate-300',
    },
  };

  const currentPreset = variant ? presets[variant] : {};

  return (
    <div
      className={cn(
        'inline-flex items-center rounded-md border select-none h-[22px]',
        currentPreset.wrapper,
        className
      )}
    >
      {/* Segment 1: Label + Icon */}
      <div className="flex items-center gap-1.5 px-2 py-0.5">
        {Icon && <Icon className="w-3 h-3" strokeWidth={2.5} />}
        <span className={cn('text-[10px] uppercase tracking-wider font-bold', labelClassName)}>
          {label}
        </span>
      </div>

      {/* Segment 2: Value (Optional) */}
      {value && (
        <>
          <div
            className={cn('w-[1px] h-3 self-center', currentPreset.separator, separatorClassName)}
          />
          <span className="px-2 py-0.5 text-[10px] font-medium font-mono">{value}</span>
        </>
      )}
    </div>
  );
}
