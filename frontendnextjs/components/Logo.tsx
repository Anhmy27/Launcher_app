interface LogoProps {
  size?: number;
  className?: string;
}

export default function Logo({ size = 36, className = "" }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      <defs>
        <linearGradient id="adminLogoGrad" x1="8" y1="4" x2="32" y2="36" gradientUnits="userSpaceOnUse">
          <stop stopColor="#6366f1" />
          <stop offset="1" stopColor="#a78bfa" />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="10" fill="url(#adminLogoGrad)" />
      <path
        d="M14 12L28 20L14 28V22.5L22 20L14 17.5V12Z"
        fill="white"
        fillOpacity="0.95"
      />
    </svg>
  );
}
