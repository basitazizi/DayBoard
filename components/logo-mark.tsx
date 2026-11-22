import { cn } from "@/lib/cn";

/**
 * The DayBoard mark: a "D" whose stem is three agenda rows and whose bowl wraps around them.
 * The same drawing as app/icon.svg. By default it follows the theme: a dark tile in light mode,
 * a light tile in dark mode. Pass `invert` to draw it on a dark or coloured background.
 */
export function LogoMark({ size = 32, invert, className }: { size?: number; invert?: boolean; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden className={cn("shrink-0", className)}>
      <rect width="64" height="64" rx="15" className={invert ? "fill-white" : "fill-ink"} />
      <g className={invert ? "fill-[#0d0d0f] stroke-[#0d0d0f]" : "fill-bg stroke-bg"}>
        <rect x="15" y="15" width="9" height="9" rx="3" stroke="none" />
        <rect x="15" y="27.5" width="9" height="9" rx="3" stroke="none" />
        <rect x="15" y="40" width="9" height="9" rx="3" stroke="none" />
        <path d="M28 15h3.5c9.4 0 17 7.6 17 17s-7.6 17-17 17H28" fill="none" strokeWidth="8" strokeLinecap="round" />
      </g>
    </svg>
  );
}
