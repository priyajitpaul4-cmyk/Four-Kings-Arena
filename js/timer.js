/**
 * timer.js
 * -----------------------------------------------------------------------
 * Real, independent countdown clocks for each of the 4 players, with
 * increment support. Not a fake/decorative timer: each player's time is
 * tracked in milliseconds and only the active player's clock ticks.
 */

const TIME_CONTROLS = [
  { id: 'bullet-1-0',  label: '1+0',   group: 'Bullet',     minutes: 1,  incrementSec: 0 },
  { id: 'bullet-1-1',  label: '1+1',   group: 'Bullet',     minutes: 1,  incrementSec: 1 },
  { id: 'bullet-2-0',  label: '2+0',   group: 'Bullet',     minutes: 2,  incrementSec: 0 },
  { id: 'bullet-2-1',  label: '2+1',   group: 'Bullet',     minutes: 2,  incrementSec: 1 },
  { id: 'blitz-3-0',   label: '3+0',   group: 'Blitz',      minutes: 3,  incrementSec: 0 },
  { id: 'blitz-3-2',   label: '3+2',   group: 'Blitz',      minutes: 3,  incrementSec: 2 },
  { id: 'blitz-5-0',   label: '5+0',   group: 'Blitz',      minutes: 5,  incrementSec: 0 },
  { id: 'blitz-5-3',   label: '5+3',   group: 'Blitz',      minutes: 5,  incrementSec: 3 },
  { id: 'rapid-10-0',  label: '10+0',  group: 'Rapid',      minutes: 10, incrementSec: 0 },
  { id: 'rapid-10-5',  label: '10+5',  group: 'Rapid',      minutes: 10, incrementSec: 5 },
  { id: 'rapid-15-10', label: '15+10', group: 'Rapid',      minutes: 15, incrementSec: 10 },
  { id: 'classical-30-0',  label: '30+0',  group: 'Classical', minutes: 30, incrementSec: 0 },
  { id: 'classical-30-20', label: '30+20', group: 'Classical', minutes: 30, incrementSec: 20 },
];

class ChessClocks {
  /**
   * @param {number} minutes base minutes per player
   * @param {number} incrementSec increment seconds added after each move
   * @param {(player:string, msLeft:number)=>void} onTick
   * @param {(player:string)=>void} onTimeout
   */
  constructor(minutes, incrementSec, onTick, onTimeout) {
    this.baseMs = Math.round(minutes * 60 * 1000);
    this.incrementMs = Math.round(incrementSec * 1000);
    this.onTick = onTick || (() => {});
    this.onTimeout = onTimeout || (() => {});
    this.times = {};
    for (const p of CHESS_CONST.PLAYERS) this.times[p] = this.baseMs;
    this.activePlayer = null;
    this.running = false;
    this._raf = null;
    this._lastTs = null;
    this.frozen = new Set(); // eliminated/resigned/timed-out players stop ticking forever
  }

  setActive(player) {
    this.activePlayer = player;
  }

  freeze(player) {
    this.frozen.add(player);
  }

  addIncrement(player) {
    if (this.incrementMs > 0 && this.times[player] != null) {
      this.times[player] += this.incrementMs;
    }
  }

  start() {
    if (this.running) return;
    this.running = true;
    this._lastTs = performance.now();
    const loop = (ts) => {
      if (!this.running) return;
      const dt = ts - this._lastTs;
      this._lastTs = ts;
      const p = this.activePlayer;
      if (p && !this.frozen.has(p)) {
        this.times[p] = Math.max(0, this.times[p] - dt);
        this.onTick(p, this.times[p]);
        if (this.times[p] <= 0) {
          this.frozen.add(p);
          this.onTimeout(p);
        }
      }
      this._raf = requestAnimationFrame(loop);
    };
    this._raf = requestAnimationFrame(loop);
  }

  pause() {
    this.running = false;
    if (this._raf) cancelAnimationFrame(this._raf);
  }

  resume() {
    if (!this.running) this.start();
  }

  msLeft(player) {
    return this.times[player];
  }

  static format(ms) {
    if (ms == null) return '--:--';
    const totalSec = Math.max(0, Math.ceil(ms / 1000));
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    if (m === 0) {
      // Show tenths under 10 seconds for drama/precision at bullet speeds.
      const tenths = Math.max(0, Math.floor((ms % 1000) / 100));
      if (totalSec < 10) return `0:0${s}.${tenths}`;
    }
    return `${m}:${s.toString().padStart(2, '0')}`;
  }
}

if (typeof window !== 'undefined') {
  window.ChessClocks = ChessClocks;
  window.TIME_CONTROLS = TIME_CONTROLS;
}
