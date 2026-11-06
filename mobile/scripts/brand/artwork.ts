/**
 * App artwork as SVG strings (single source for the launcher icon and the
 * splash logo). Rendered by generate.ts.
 *
 * Concept: fanned flashcards (word + translation lines) with a "learned"
 * check badge, on an indigo → violet gradient.
 */

export const BRAND = {
  gradientStart: '#5B7CFA',
  gradientEnd: '#7B3FE4',
  /** Splash background: the middle of the gradient. */
  splashBackground: '#6A5DF0',
  cardTop: '#FFFFFF',
  cardBottom: '#EEF1FF',
  wordLine: '#5B6CF5',
  translationLine: '#C9D1FB',
  badge: '#22C3A6',
};

/** The cards + badge, drawn around (0, 0) in a ~720 × 760 box. */
function mark(): string {
  return `
  <g opacity="0.28" transform="rotate(-14)">
    <rect x="-215" y="-280" width="400" height="520" rx="56" fill="#FFFFFF"/>
  </g>
  <g opacity="0.5" transform="rotate(-5)">
    <rect x="-205" y="-275" width="400" height="520" rx="56" fill="#FFFFFF"/>
  </g>
  <g transform="rotate(5)" filter="url(#cardShadow)">
    <rect x="-195" y="-270" width="400" height="520" rx="56" fill="url(#card)"/>
    <rect x="-125" y="-180" width="200" height="40" rx="20" fill="${BRAND.wordLine}"/>
    <rect x="-125" y="-105" width="260" height="26" rx="13" fill="${BRAND.translationLine}"/>
    <rect x="-125" y="-55" width="190" height="26" rx="13" fill="${BRAND.translationLine}"/>
    <rect x="-125" y="25" width="250" height="20" rx="10" fill="${BRAND.translationLine}" opacity="0.6"/>
    <rect x="-125" y="65" width="160" height="20" rx="10" fill="${BRAND.translationLine}" opacity="0.6"/>
  </g>
  <g transform="translate(165 205)" filter="url(#badgeShadow)">
    <circle r="112" fill="${BRAND.badge}" stroke="#FFFFFF" stroke-width="20"/>
    <path d="M -50 4 L -14 40 L 54 -32" fill="none" stroke="#FFFFFF"
      stroke-width="34" stroke-linecap="round" stroke-linejoin="round"/>
  </g>`;
}

function defs(): string {
  return `
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${BRAND.gradientStart}"/>
      <stop offset="1" stop-color="${BRAND.gradientEnd}"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.28" cy="0.2" r="0.7">
      <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.22"/>
      <stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="card" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${BRAND.cardTop}"/>
      <stop offset="1" stop-color="${BRAND.cardBottom}"/>
    </linearGradient>
    <filter id="cardShadow" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="22" stdDeviation="24" flood-color="#1B1464" flood-opacity="0.35"/>
    </filter>
    <filter id="badgeShadow" x="-40%" y="-40%" width="180%" height="180%">
      <feDropShadow dx="0" dy="10" stdDeviation="14" flood-color="#0B3D35" flood-opacity="0.35"/>
    </filter>
  </defs>`;
}

/** Gradient background (full bleed square; platforms apply their own mask). */
export function backgroundSvg(size = 1024): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 1024 1024">
  ${defs()}
  <rect width="1024" height="1024" fill="url(#bg)"/>
  <rect width="1024" height="1024" fill="url(#glow)"/>
</svg>`;
}

/**
 * Cards + badge on a transparent square. `scale` is the mark size relative
 * to the canvas (Android adaptive icons need it inside the 66% safe zone).
 */
export function markSvg(size = 1024, scale = 0.78): string {
  const s = (1024 * scale) / 820;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 1024 1024">
  ${defs()}
  <g transform="translate(512 500) scale(${s})">${mark()}</g>
</svg>`;
}

/** Full launcher icon: background + mark. */
export function iconSvg(size = 1024): string {
  const s = (1024 * 0.74) / 820;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 1024 1024">
  ${defs()}
  <rect width="1024" height="1024" fill="url(#bg)"/>
  <rect width="1024" height="1024" fill="url(#glow)"/>
  <g transform="translate(512 505) scale(${s})">${mark()}</g>
</svg>`;
}
