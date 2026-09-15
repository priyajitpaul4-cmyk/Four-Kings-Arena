/**
 * ui.js
 * -----------------------------------------------------------------------
 * Generated Web Audio sound effects (no external/copyrighted audio files)
 * plus small reusable UI helpers (toast messages, modal confirm).
 */

class SoundManager {
  constructor() {
    this.ctx = null;
    this.enabled = true;
  }

  _ensureCtx() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) this.ctx = new AC();
    }
    return this.ctx;
  }

  setEnabled(v) { this.enabled = v; }

  _tone(freq, duration, type = 'sine', gainPeak = 0.15, delay = 0) {
    if (!this.enabled) return;
    const ctx = this._ensureCtx();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    const t0 = ctx.currentTime + delay;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(gainPeak, t0 + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }

  move() { this._tone(420, 0.09, 'triangle'); }
  capture() { this._tone(260, 0.12, 'sawtooth', 0.18); this._tone(180, 0.14, 'square', 0.08, 0.04); }
  check() { this._tone(660, 0.1, 'square', 0.15); this._tone(880, 0.12, 'square', 0.12, 0.1); }
  checkmate() { [520, 420, 320, 220].forEach((f, i) => this._tone(f, 0.22, 'sawtooth', 0.15, i * 0.14)); }
  gameStart() { this._tone(440, 0.1, 'sine'); this._tone(660, 0.14, 'sine', 0.12, 0.1); }
  gameEnd() { this.checkmate(); }
  puzzleSuccess() { [523, 659, 784].forEach((f, i) => this._tone(f, 0.15, 'sine', 0.15, i * 0.08)); }
  puzzleFail() { this._tone(200, 0.25, 'sawtooth', 0.15); }
  timerWarning() { this._tone(880, 0.08, 'square', 0.1); }
  click() { this._tone(500, 0.04, 'sine', 0.08); }
}

function showToast(message, ms = 2600) {
  let host = document.getElementById('toast-host');
  if (!host) {
    host = document.createElement('div');
    host.id = 'toast-host';
    document.body.appendChild(host);
  }
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = message;
  host.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 300);
  }, ms);
}

function confirmDialog(message) {
  return window.confirm(message);
}

if (typeof window !== 'undefined') {
  window.SoundManager = SoundManager;
  window.showToast = showToast;
  window.confirmDialog = confirmDialog;
}
