/**
 * arena.js
 * -----------------------------------------------------------------------
 * Two jobs that keep the four-sided arena honest on every screen size:
 *
 * 1. ArenaFit — measures the actual pixel space available for the board
 *    (via ResizeObserver on the arena's centre cell) and sets the board to
 *    the largest square that fits, instead of guessing with vw/vh alone.
 *    Recalculates on resize, orientation change, mobile browser chrome
 *    show/hide (visualViewport), and any layout change that resizes the
 *    wrapper (panels changing width, controls bar wrapping, etc.).
 *
 * 2. applyPanelOrientation(orientation) — the four player panels
 *    (#panel-red/blue/yellow/green) are plain, unpositioned <div>s in the
 *    HTML. This function is the ONLY thing that assigns them a side
 *    (top/left/right/bottom) via CSS grid-area classes, based on which
 *    colour is currently facing the viewer at the bottom of the board.
 *    That keeps "which panel is where" and "which way the board is
 *    rotated" impossible to disagree with each other, and means no panel
 *    ever gets an arbitrary absolute position.
 */

const ArenaFit = {
  _ro: null,
  _apply: null,

  watch(wrapEl, boardEl, opts) {
    if (!wrapEl || !boardEl) return;
    const minPx = (opts && opts.min) || 200;
    const maxPx = (opts && opts.max) || 720;

    // NOTE: wrapEl has no CSS height of its own (it hugs its child), so
    // wrapEl.clientHeight would just mirror whatever height we last gave
    // the board -- a circular measurement that can't detect real
    // available vertical space. Instead we measure true available height
    // top-down from the viewport: everything above the board (nav/hero)
    // is already excluded because we read the wrap's own top offset, and
    // everything below (controls bar, captured/move-history panel, mobile
    // bottom nav) is measured directly and subtracted.
    const apply = () => {
      const w = wrapEl.clientWidth;
      const viewportH = window.visualViewport ? window.visualViewport.height : window.innerHeight;
      const top = wrapEl.getBoundingClientRect().top;
      const arenaEl = wrapEl.closest('.arena');
      const bottomPanelEl = arenaEl ? arenaEl.querySelector('.panel-bottom') : null;
      const bottomPanelH = bottomPanelEl ? bottomPanelEl.getBoundingClientRect().height : 0;
      const rowGap = arenaEl ? (parseFloat(getComputedStyle(arenaEl).rowGap) || 0) : 0;
      const arenaMarginBottom = arenaEl ? parseFloat(getComputedStyle(arenaEl).marginBottom) || 0 : 0;
      const screenEl = document.getElementById('screen-game');
      const screenPaddingBottom = screenEl ? parseFloat(getComputedStyle(screenEl).paddingBottom) || 0 : 0;
      const gameSide = document.querySelector('.game-side');
      const gameSideH = gameSide ? gameSide.getBoundingClientRect().height : 0;
      const bottomNav = document.querySelector('.bottomnav');
      const bottomNavVisible = bottomNav && getComputedStyle(bottomNav).display !== 'none';
      const bottomNavH = bottomNavVisible ? bottomNav.getBoundingClientRect().height : 0;
      const buffer = 10;
      // Everything below the board within the arena itself (the fourth
      // player's panel row plus the grid gap) has to be subtracted too --
      // it isn't captured by anything measured above the board.
      const h = viewportH - top - bottomPanelH - rowGap - arenaMarginBottom - gameSideH - screenPaddingBottom - bottomNavH - buffer;
      if (w <= 0 || h <= 0) return;
      const size = Math.max(minPx, Math.min(maxPx, Math.floor(Math.min(w, h))));
      boardEl.style.width = size + 'px';
      boardEl.style.height = size + 'px';
    };

    this._apply = apply;
    apply();

    if ('ResizeObserver' in window) {
      if (this._ro) this._ro.disconnect();
      this._ro = new ResizeObserver(() => apply());
      this._ro.observe(wrapEl);
    }
    window.addEventListener('resize', apply);
    window.addEventListener('orientationchange', () => setTimeout(apply, 80));
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', apply);
    }
  },

  recalc() {
    if (this._apply) this._apply();
  },
};

// For a given orientation (the colour shown at the BOTTOM of the board),
// which colour visually belongs on each of the other three sides. Kept in
// lockstep with BoardView's own rotation math in board.js.
const ORIENTATION_SIDES = {
  red:    { bottom: 'red',    left: 'blue',   top: 'yellow', right: 'green' },
  green:  { bottom: 'green',  left: 'red',    top: 'blue',   right: 'yellow' },
  yellow: { bottom: 'yellow', left: 'green',  top: 'red',    right: 'blue' },
  blue:   { bottom: 'blue',   left: 'yellow', top: 'green',  right: 'red' },
};

function applyPanelOrientation(orientation) {
  const sides = ORIENTATION_SIDES[orientation] || ORIENTATION_SIDES.red;
  const sideOfColor = {};
  Object.keys(sides).forEach(side => { sideOfColor[sides[side]] = side; });

  CHESS_CONST.PLAYERS.forEach(color => {
    const el = document.getElementById('panel-' + color);
    if (!el) return;
    el.classList.remove('panel-top', 'panel-left', 'panel-right', 'panel-bottom');
    el.classList.add('panel-' + sideOfColor[color]);
  });
}

if (typeof window !== 'undefined') {
  window.ArenaFit = ArenaFit;
  window.ORIENTATION_SIDES = ORIENTATION_SIDES;
  window.applyPanelOrientation = applyPanelOrientation;
}
