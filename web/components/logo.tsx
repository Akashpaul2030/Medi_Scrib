export function Logo({ size = 22 }: { size?: number }) {
  return (
    <div className="flex items-center gap-2">
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
        <rect x="0" y="0" width="24" height="24" rx="6" fill="#0F766E" />
        <g stroke="white" strokeWidth="1.6" strokeLinecap="round">
          <line x1="7" y1="9" x2="7" y2="15" />
          <line x1="10" y1="7" x2="10" y2="17" />
          <line x1="13" y1="10" x2="13" y2="14" />
          <line x1="16" y1="8" x2="16" y2="16" />
        </g>
      </svg>
      <span className="font-display text-[17px] font-semibold tracking-tight text-ink">
        ScribeAI
      </span>
    </div>
  );
}
