import "./Logo.css";

interface LogoProps {
  size?: number;
  withLabel?: boolean;
}

export function Logo({ size = 36, withLabel = true }: LogoProps) {
  return (
    <div className="logo">
      <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <rect x="1" y="1" width="46" height="46" rx="12" fill="url(#logo-bg)" stroke="var(--color-accent-500)" strokeWidth="1.5" />
        <path
          d="M24 12c-3.2 0-5.8 2.4-5.8 5.6 0 3.6 3.4 5.6 5.8 8.6 2.4-3 5.8-5 5.8-8.6 0-3.2-2.6-5.6-5.8-5.6Z"
          fill="var(--color-accent-500)"
        />
        <rect x="21.6" y="25.4" width="4.8" height="7.4" rx="1.2" fill="var(--color-accent-500)" />
        <rect x="16.5" y="32" width="15" height="3.6" rx="1.6" fill="var(--color-accent-500)" />
        <defs>
          <linearGradient id="logo-bg" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
            <stop stopColor="var(--color-surface-hover)" />
            <stop offset="1" stopColor="var(--color-bg)" />
          </linearGradient>
        </defs>
      </svg>
      {withLabel && (
        <span className="logo-label">
          Truco <strong>do Novo</strong>
        </span>
      )}
    </div>
  );
}
