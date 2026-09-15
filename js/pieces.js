/**
 * pieces.js
 * -----------------------------------------------------------------------
 * An original, geometric layered-SVG piece set ("Modern" style) — not a
 * trace or derivative of any existing chess piece artwork (e.g. the
 * common Cburnett/Wikipedia sets), so there's no copyright entanglement.
 * Each piece is built from simple primitives (circles, rects, paths) with
 * a two-stop gradient plus a soft drop-shadow filter for a layered,
 * slightly-3D feel while staying lightweight (pure inline SVG, no images).
 *
 * Honesty note: this ships ONE additional premium style ("Modern") next
 * to the original glyph-based "Minimal" style — not the four separate
 * families (3D Classic / Modern / Tournament / Minimal) a full request
 * might want. Two real, finished styles beat four where two are reskins
 * in name only. See README.md.
 */

function _lighten(hex, amt) {
  const n = parseInt(hex.replace('#', ''), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  r = Math.min(255, Math.round(r + (255 - r) * amt));
  g = Math.min(255, Math.round(g + (255 - g) * amt));
  b = Math.min(255, Math.round(b + (255 - b) * amt));
  return `rgb(${r},${g},${b})`;
}

function _darken(hex, amt) {
  const n = parseInt(hex.replace('#', ''), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  r = Math.round(r * (1 - amt));
  g = Math.round(g * (1 - amt));
  b = Math.round(b * (1 - amt));
  return `rgb(${r},${g},${b})`;
}

const PIECE_BODY = {
  P: `<ellipse cx="22" cy="37" rx="12" ry="4" class="pc-shadow"/>
      <path d="M13,37 Q13,26 18,22 Q14,19 14,14 A8,8 0 1,1 30,14 Q30,19 26,22 Q31,26 31,37 Z" fill="url(#g)"/>
      <circle cx="22" cy="13" r="3.4" fill="url(#hl)"/>`,
  R: `<ellipse cx="22" cy="39" rx="14" ry="3.6" class="pc-shadow"/>
      <rect x="10" y="30" width="24" height="8" rx="1.5" fill="url(#g)"/>
      <path d="M13,30 L13,14 L17,14 L17,18 L21,18 L21,14 L23,14 L23,18 L27,18 L27,14 L31,14 L31,30 Z" fill="url(#g)"/>
      <rect x="12" y="26" width="20" height="3" fill="url(#hl)" opacity="0.55"/>`,
  N: `<ellipse cx="22" cy="39" rx="13" ry="3.6" class="pc-shadow"/>
      <path d="M14,38 Q12,28 16,23 Q11,21 11,16 Q11,10 17,8 Q16,11 18,12 Q23,7 30,10 Q34,12 33,18 Q32,23 27,24 Q31,27 30,33 L30,38 Z" fill="url(#g)"/>
      <circle cx="26" cy="14" r="1.6" fill="#1a1a1a" opacity="0.7"/>
      <path d="M17,8 Q19,13 24,13" stroke="url(#hl)" stroke-width="1.6" fill="none" opacity="0.7"/>`,
  B: `<ellipse cx="22" cy="39" rx="12.5" ry="3.6" class="pc-shadow"/>
      <path d="M14,38 Q13,30 18,26 Q13,23 13,18 Q13,11 22,7 Q31,11 31,18 Q31,23 26,26 Q31,30 30,38 Z" fill="url(#g)"/>
      <circle cx="22" cy="6" r="2.6" fill="url(#hl)"/>
      <path d="M18,20 L26,20 M22,16 L22,24" stroke="#1a1a1a" stroke-width="1.3" opacity="0.55"/>`,
  Q: `<ellipse cx="22" cy="39" rx="14.5" ry="3.6" class="pc-shadow"/>
      <path d="M12,38 Q11,28 16,24 L12,12 L18,17 L20,8 L22,16 L24,8 L26,17 L32,12 L28,24 Q33,28 32,38 Z" fill="url(#g)"/>
      <circle cx="12" cy="11" r="2" fill="url(#hl)"/><circle cx="22" cy="7" r="2.2" fill="url(#hl)"/><circle cx="32" cy="11" r="2" fill="url(#hl)"/>
      <rect x="13" y="34" width="18" height="3" fill="url(#hl)" opacity="0.5"/>`,
  K: `<ellipse cx="22" cy="39" rx="14.5" ry="3.6" class="pc-shadow"/>
      <path d="M12,38 Q11,27 17,23 Q12,20 13,14 Q14,10 22,10 Q30,10 31,14 Q32,20 27,23 Q33,27 32,38 Z" fill="url(#g)"/>
      <rect x="20.4" y="2" width="3.2" height="8" fill="url(#hl)"/>
      <rect x="18" y="4.4" width="8" height="3.2" fill="url(#hl)"/>
      <rect x="14" y="32" width="16" height="3" fill="url(#hl)" opacity="0.5"/>`,
};

function pieceSVG(type, hex, opts) {
  const light = _lighten(hex, 0.55);
  const dark = _darken(hex, 0.35);
  const uid = 'p' + Math.random().toString(36).slice(2, 9);
  const inert = opts && opts.inert;
  return `<svg viewBox="0 0 44 44" class="fka-svg-piece${inert ? ' inert' : ''}" aria-hidden="true">
    <defs>
      <linearGradient id="g-${uid}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${light}"/>
        <stop offset="1" stop-color="${dark}"/>
      </linearGradient>
      <linearGradient id="hl-${uid}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#ffffff" stop-opacity="0.95"/>
        <stop offset="1" stop-color="#ffffff" stop-opacity="0.35"/>
      </linearGradient>
      <filter id="sh-${uid}" x="-40%" y="-40%" width="180%" height="180%">
        <feDropShadow dx="0" dy="1.2" stdDeviation="1" flood-color="#000" flood-opacity="0.45"/>
      </filter>
    </defs>
    <g filter="url(#sh-${uid})">
      ${(PIECE_BODY[type] || '').replace(/url\(#g\)/g, `url(#g-${uid})`).replace(/url\(#hl\)/g, `url(#hl-${uid})`)}
    </g>
  </svg>`;
}

if (typeof window !== 'undefined') {
  window.pieceSVG = pieceSVG;
}
