/**
 * storage.js
 * -----------------------------------------------------------------------
 * Single point of contact with localStorage so no other file calls it
 * directly. Everything is namespaced under "fka:" (Four Kings Arena).
 */

const Storage = {
  KEYS: {
    SETTINGS: 'fka:settings',
    PROFILE: 'fka:profile',
    HISTORY: 'fka:history',
    STATS: 'fka:stats',
  },

  _get(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (raw == null) return fallback;
      return JSON.parse(raw);
    } catch (e) {
      console.warn('Storage read failed for', key, e);
      return fallback;
    }
  },

  _set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.warn('Storage write failed for', key, e);
      return false;
    }
  },

  defaultSettings() {
    return {
      theme: 'dark',
      boardTheme: 'classic',
      pieceStyle: 'modern',
      sound: true,
      animations: true,
      showLegalMoves: true,
      showCoordinates: true,
      moveConfirmation: false,
      timerWarningSec: 20,
    };
  },

  getSettings() {
    return { ...this.defaultSettings(), ...this._get(this.KEYS.SETTINGS, {}) };
  },

  saveSettings(patch) {
    const merged = { ...this.getSettings(), ...patch };
    this._set(this.KEYS.SETTINGS, merged);
    return merged;
  },

  defaultProfile() {
    return {
      name: 'Player',
      avatar: '♟',
      rating: 1000,
      gamesPlayed: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      bestRating: 1000,
      currentStreak: 0,
    };
  },

  getProfile() {
    return { ...this.defaultProfile(), ...this._get(this.KEYS.PROFILE, {}) };
  },

  saveProfile(patch) {
    const merged = { ...this.getProfile(), ...patch };
    this._set(this.KEYS.PROFILE, merged);
    return merged;
  },

  getHistory() {
    return this._get(this.KEYS.HISTORY, []);
  },

  addHistoryEntry(entry) {
    const list = this.getHistory();
    list.unshift(entry);
    // Keep the most recent 100 games so storage doesn't grow unbounded.
    this._set(this.KEYS.HISTORY, list.slice(0, 100));
  },

  deleteHistoryEntry(id) {
    const list = this.getHistory().filter(g => g.id !== id);
    this._set(this.KEYS.HISTORY, list);
  },

  recordResult({ didWin, didDraw }) {
    const profile = this.getProfile();
    profile.gamesPlayed += 1;
    if (didDraw) {
      profile.draws += 1;
      profile.currentStreak = 0;
    } else if (didWin) {
      profile.wins += 1;
      profile.currentStreak = Math.max(0, profile.currentStreak) + 1;
      profile.rating += 12;
    } else {
      profile.losses += 1;
      profile.currentStreak = 0;
      profile.rating = Math.max(100, profile.rating - 8);
    }
    profile.bestRating = Math.max(profile.bestRating, profile.rating);
    this.saveProfile(profile);
    return profile;
  },
};

if (typeof window !== 'undefined') {
  window.Storage = Storage;
}
