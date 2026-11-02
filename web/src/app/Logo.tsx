/** The app mark: fanned flashcards with a teal "learned" check (as the app icon). */
export function Logo({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <defs>
        <linearGradient id="logo-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#4F5BEA" />
          <stop offset="1" stopColor="#8B5CF6" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="15" fill="url(#logo-bg)" />
      <rect
        x="15"
        y="17"
        width="26"
        height="32"
        rx="5"
        fill="#fff"
        opacity="0.45"
        transform="rotate(-12 28 33)"
      />
      <rect x="22" y="15" width="26" height="33" rx="5" fill="#fff" />
      <path
        d="M28.5 32.5l4.5 4.5 8.5-9"
        fill="none"
        stroke="#14B8A6"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
