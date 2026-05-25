import { ChevronRight, type LucideIcon } from 'lucide-react';

type MainServiceCardProps = {
  href: string;
  icon: LucideIcon;
  mobileLabel?: string;
  situation: string;
  testId?: string;
  title: string;
};

export function MainServiceCard({
  href,
  icon: Icon,
  mobileLabel,
  situation,
  testId,
  title,
}: MainServiceCardProps) {
  return (
    <a
      data-testid={testId}
      href={href}
      className="group relative flex min-h-[70px] min-w-0 flex-1 flex-col items-center justify-start gap-1 rounded-2xl bg-transparent p-0.5 text-center transition-all hover:bg-white/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0e5c2b] active:scale-[0.96] min-[380px]:h-[122px] min-[380px]:bg-transparent min-[380px]:p-1 md:h-[140px] md:items-center md:justify-start md:bg-white md:p-2.5 md:pt-3 md:shadow-md md:shadow-emerald-900/5 md:ring-1 md:ring-slate-900/5 md:hover:bg-slate-50"
    >
      <span data-testid="main-service-card" className="contents">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#e9f4ed] text-[#0e5c2b] shadow-sm shadow-emerald-900/5 transition-transform group-hover:scale-105 min-[380px]:h-12 min-[380px]:w-12 md:h-10 md:w-10 md:rounded-[0.8rem]">
          <Icon
            className="h-5 w-5 min-[380px]:h-[1.375rem] min-[380px]:w-[1.375rem] md:h-6 md:w-6"
            aria-hidden="true"
          />
        </span>
        <span className="flex min-w-0 flex-col items-center gap-0.5 px-0.5 text-center md:mt-2.5">
          <span className="block max-w-[3.8rem] truncate text-[0.68rem] font-extrabold leading-tight tracking-normal text-slate-900 min-[380px]:mt-0.5 min-[380px]:max-w-[4.15rem] md:max-w-none md:text-sm md:line-clamp-2">
            {mobileLabel ?? title}
          </span>
          <span className="mt-0.5 hidden max-w-[4.15rem] text-[0.56rem] font-medium leading-[1.12] text-slate-600 line-clamp-2 min-[380px]:block md:max-w-none md:text-xs">
            {situation}
          </span>
        </span>
      </span>
      <ChevronRight
        className="absolute bottom-2 hidden h-3.5 w-3.5 text-slate-300 transition-transform group-hover:translate-y-0.5 min-[380px]:block"
        aria-hidden="true"
      />
    </a>
  );
}
