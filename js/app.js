/**
 * app.js
 * -----------------------------------------------------------------------
 * Screens, setup flow, and the live-game orchestrator that wires together
 * ChessEngine + ChessAI + ChessClocks + BoardView + ArenaFit + Storage.
 *
 * Game modes are modelled as a single generic "seat configuration"
 * (each of the 4 colours is either 'human' or 'ai') rather than as
 * separate hardcoded modes -- that's what lets 1v3, 2v2, 3v1, 4 humans,
 * and 4-AI watch mode all be the same code path instead of five
 * near-duplicate ones.
 */

(function () {
  const sound = new SoundManager();
  let settings = Storage.getSettings();

  // ---------------------------------------------------------------------
  // Navigation
  // ---------------------------------------------------------------------

  function navigate(name) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const target = document.getElementById('screen-' + name);
    if (target) target.classList.add('active');
    document.querySelectorAll('.bottomnav button, .nav-links button').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.nav === name);
    });
    if (name === 'home') renderHome();
    if (name === 'setup') renderSetup();
    if (name === 'stats') renderStats();
    if (name === 'history') renderHistory();
    if (name === 'settings') renderSettingsScreen();
    if (name === 'game' && game) ArenaFit.recalc();
    window.scrollTo(0, 0);
  }

  document.querySelectorAll('[data-nav]').forEach(el => {
    el.addEventListener('click', () => navigate(el.dataset.nav));
  });

  // ---------------------------------------------------------------------
  // Theme application
  // ---------------------------------------------------------------------

  function applyTheme() {
    document.documentElement.setAttribute('data-theme', settings.theme);
    document.documentElement.classList.toggle('no-animations', !settings.animations);
  }

  // ---------------------------------------------------------------------
  // HOME
  // ---------------------------------------------------------------------

  function ratingCategory(rating) {
    if (rating < 800) return 'Beginner';
    if (rating < 1000) return 'Novice';
    if (rating < 1200) return 'Amateur';
    if (rating < 1400) return 'Intermediate';
    if (rating < 1600) return 'Advanced';
    if (rating < 1800) return 'Expert';
    if (rating < 2000) return 'Master';
    return 'Elite';
  }

  function renderHome() {
    const profile = Storage.getProfile();
    const winRate = profile.gamesPlayed ? Math.round((profile.wins / profile.gamesPlayed) * 100) : 0;
    const cards = [
      { value: profile.rating, label: 'Rating (' + ratingCategory(profile.rating) + ')' },
      { value: profile.gamesPlayed, label: 'Games played' },
      { value: winRate + '%', label: 'Win rate' },
      { value: profile.currentStreak, label: 'Current streak' },
    ];
    document.getElementById('home-stats-cards').innerHTML = cards.map(c =>
      `<div class="stat-card"><div class="value">${c.value}</div><div class="label">${c.label}</div></div>`
    ).join('');

    const history = Storage.getHistory().slice(0, 5);
    const list = document.getElementById('home-recent-list');
    if (!history.length) {
      list.innerHTML = '<p class="recent-empty">No games yet -- start one above.</p>';
    } else {
      list.innerHTML = history.map(g => `
        <div class="recent-item">
          <span>${escapeHtml(g.modeLabel || 'Game')} · ${new Date(g.date).toLocaleDateString()}</span>
          <span class="badge">${escapeHtml(g.resultLabel)}</span>
        </div>`).join('');
    }
  }

  document.querySelectorAll('[data-start-preset]').forEach(btn => {
    btn.addEventListener('click', () => {
      applyPreset(btn.dataset.startPreset);
      navigate('setup');
    });
  });

  // ---------------------------------------------------------------------
  // SETUP -- seat configuration model
  // ---------------------------------------------------------------------

  // seats[color] = { type: 'human' | 'ai', name: string }
  let seats = {
    red: { type: 'human', name: 'Player' },
    blue: { type: 'ai', name: 'Computer' },
    yellow: { type: 'ai', name: 'Computer' },
    green: { type: 'ai', name: 'Computer' },
  };

  const PRESETS = {
    '1v3': ['human', 'ai', 'ai', 'ai'],
    '2v2': ['human', 'human', 'ai', 'ai'],
    '3v1': ['human', 'human', 'human', 'ai'],
    '4human': ['human', 'human', 'human', 'human'],
    '4ai': ['ai', 'ai', 'ai', 'ai'],
  };

  function applyPreset(key) {
    const types = PRESETS[key] || PRESETS['1v3'];
    const profile = Storage.getProfile();
    CHESS_CONST.PLAYERS.forEach((color, i) => {
      const type = types[i];
      const isFirstHuman = type === 'human' && !CHESS_CONST.PLAYERS.slice(0, i).some((c2, j) => types[j] === 'human');
      seats[color] = {
        type,
        name: type === 'ai' ? 'Computer' : (isFirstHuman ? profile.name : CHESS_CONST.PLAYER_META[color].label),
      };
    });
  }

  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      applyPreset(btn.dataset.preset);
      renderSetup();
    });
  });

  function modeSummary() {
    const humans = CHESS_CONST.PLAYERS.filter(c => seats[c].type === 'human').length;
    const ais = 4 - humans;
    if (humans === 0) return '4 computer players -- Watch Mode.';
    if (ais === 0) return '4 human seats -- pass the device around.';
    return `${humans} human seat${humans > 1 ? 's' : ''}, ${ais} computer seat${ais > 1 ? 's' : ''}.`;
  }

  function modeLabel() {
    const humans = CHESS_CONST.PLAYERS.filter(c => seats[c].type === 'human').length;
    if (humans === 0) return '4 AI -- Watch Mode';
    if (humans === 4) return '4 Human Players';
    return `${humans}v${4 - humans} (Human/AI)`;
  }

  function renderSetup() {
    document.getElementById('mode-summary').textContent = modeSummary();
    renderPlayerRows();
    const anyAI = CHESS_CONST.PLAYERS.some(c => seats[c].type === 'ai');
    document.getElementById('ai-difficulty-card').style.display = anyAI ? '' : 'none';
    syncSetupPrefsFromSettings();
  }

  function renderPlayerRows() {
    const host = document.getElementById('player-rows');
    host.innerHTML = CHESS_CONST.PLAYERS.map(color => {
      const seat = seats[color];
      const meta = CHESS_CONST.PLAYER_META[color];
      return `
        <div class="player-row" data-color="${color}">
          <span class="player-swatch" style="background:${meta.hex}"></span>
          <span class="seat-label">${meta.label}</span>
          <div class="segmented seat-toggle">
            <button type="button" class="seg-btn seat-human ${seat.type === 'human' ? 'active' : ''}" data-color="${color}" data-type="human">Human</button>
            <button type="button" class="seg-btn seat-ai ${seat.type === 'ai' ? 'active' : ''}" data-color="${color}" data-type="ai">Computer</button>
          </div>
          ${seat.type === 'human' ? `<input type="text" class="seat-name" data-color="${color}" value="${escapeAttr(seat.name)}" maxlength="16">` : `<span class="seat-ai-badge">🤖 Computer</span>`}
        </div>`;
    }).join('');

    host.querySelectorAll('.seat-toggle button').forEach(btn => {
      btn.addEventListener('click', () => {
        const color = btn.dataset.color;
        seats[color].type = btn.dataset.type;
        if (btn.dataset.type === 'human' && (!seats[color].name || seats[color].name === 'Computer')) {
          seats[color].name = CHESS_CONST.PLAYER_META[color].label;
        }
        renderSetup();
      });
    });
    host.querySelectorAll('.seat-name').forEach(inp => {
      inp.addEventListener('input', () => { seats[inp.dataset.color].name = inp.value; });
    });
  }

  // AI level select
  document.getElementById('ai-level-select').innerHTML = AI_LEVELS.map(l => `<option value="${l.id}">${l.id} -- ${l.name}</option>`).join('');
  document.getElementById('ai-level-select').addEventListener('change', updateAiDesc);
  function updateAiDesc() {
    const id = Number(document.getElementById('ai-level-select').value);
    const lvl = AI_LEVELS.find(l => l.id === id);
    document.getElementById('ai-level-desc').textContent = lvl ? lvl.desc : '';
  }
  document.getElementById('ai-level-select').value = 3;
  updateAiDesc();

  // Time control select
  const tcSelect = document.getElementById('time-control-select');
  const groups = {};
  TIME_CONTROLS.forEach(tc => { (groups[tc.group] = groups[tc.group] || []).push(tc); });
  tcSelect.innerHTML = Object.keys(groups).map(g =>
    `<optgroup label="${g}">${groups[g].map(tc => `<option value="${tc.id}">${tc.label}</option>`).join('')}</optgroup>`
  ).join('') + `<option value="custom">Custom…</option>`;
  tcSelect.value = 'rapid-10-0';
  tcSelect.addEventListener('change', () => {
    document.getElementById('custom-time-row').style.display = tcSelect.value === 'custom' ? 'flex' : 'none';
  });

  function syncSetupPrefsFromSettings() {
    document.getElementById('opt-sound').checked = settings.sound;
    document.getElementById('opt-animations').checked = settings.animations;
    document.getElementById('opt-legal').checked = settings.showLegalMoves;
    document.getElementById('board-theme-select').value = settings.boardTheme;
    document.getElementById('piece-style-select').value = settings.pieceStyle;
  }
  syncSetupPrefsFromSettings();

  document.getElementById('start-game-btn').addEventListener('click', () => {
    const aiLevel = Number(document.getElementById('ai-level-select').value);

    let minutes, incrementSec, timeControlLabel;
    if (tcSelect.value === 'custom') {
      minutes = Number(document.getElementById('custom-minutes').value) || 10;
      incrementSec = Number(document.getElementById('custom-increment').value) || 0;
      timeControlLabel = `${minutes}+${incrementSec} (custom)`;
    } else {
      const tc = TIME_CONTROLS.find(t => t.id === tcSelect.value);
      minutes = tc.minutes; incrementSec = tc.incrementSec; timeControlLabel = tc.label;
    }

    settings = Storage.saveSettings({
      sound: document.getElementById('opt-sound').checked,
      animations: document.getElementById('opt-animations').checked,
      showLegalMoves: document.getElementById('opt-legal').checked,
      boardTheme: document.getElementById('board-theme-select').value,
      pieceStyle: document.getElementById('piece-style-select').value,
    });
    sound.setEnabled(settings.sound);
    applyTheme();

    const seatsCopy = JSON.parse(JSON.stringify(seats));
    const names = {};
    CHESS_CONST.PLAYERS.forEach(c => { names[c] = seatsCopy[c].name || CHESS_CONST.PLAYER_META[c].label; });

    startGame({ seats: seatsCopy, names, aiLevel, minutes, incrementSec, timeControlLabel, modeLabel: modeLabel() });
  });

  // ---------------------------------------------------------------------
  // GAME
  // ---------------------------------------------------------------------

  let game = null; // live game state container

  function startGame(config) {
    const engine = new ChessEngine();
    const boardEl = document.getElementById('board');
    boardEl.className = 'fka-board theme-' + settings.boardTheme + (settings.showCoordinates ? ' show-coords' : '');

    const clocks = new ChessClocks(config.minutes, config.incrementSec,
      (player, ms) => onClockTick(player, ms),
      (player) => onTimeout(player));

    const ais = {};
    CHESS_CONST.PLAYERS.forEach(p => { if (config.seats[p].type === 'ai') ais[p] = new ChessAI(config.aiLevel); });

    const firstHuman = CHESS_CONST.PLAYERS.find(p => config.seats[p].type === 'human') || 'red';

    const board = new BoardView(boardEl, engine, {
      orientation: firstHuman,
      showLegal: settings.showLegalMoves,
      pieceStyle: settings.pieceStyle,
      onMove: (move) => {
        if (settings.moveConfirmation && !confirmDialog('Play this move?')) return;
        playMove(move);
      },
    });

    applyPanelOrientation(firstHuman);
    ArenaFit.watch(document.getElementById('board-wrap'), boardEl, { min: 180, max: 720 });

    game = {
      config, engine, clocks, ais, board,
      paused: false,
      startedAt: Date.now(),
      snapshots: [],
    };

    pushSnapshot();
    clocks.setActive(engine.currentPlayer());
    clocks.start();
    sound.gameStart();

    navigate('game');
    renderAll();
    ArenaFit.recalc();
    maybeRunAI();
  }

  function humanControlsCurrentPlayer() {
    const cp = game.engine.currentPlayer();
    return game.config.seats[cp].type === 'human';
  }

  function updateBoardInteractivity() {
    game.board.setInteractive(!game.paused && game.engine.status === 'active' && humanControlsCurrentPlayer());
  }

  function playMove(move) {
    if (!game || game.paused) return;
    const engine = game.engine;
    const mover = engine.currentPlayer();
    const record = engine.makeMove(move);
    if (!record) return;

    game.clocks.addIncrement(mover);
    pushSnapshot();

    if (record.capture) sound.capture(); else sound.move();

    const anyCheck = CHESS_CONST.PLAYERS.some(p => engine.isActive(p) && engine.isInCheck(p));
    if (engine.status === 'finished') {
      sound.gameEnd();
    } else if (anyCheck) {
      sound.check();
    }

    syncEliminationsToClocks();
    game.clocks.setActive(engine.currentPlayer());
    renderAll();

    if (engine.status === 'finished') {
      finishGame();
      return;
    }
    maybeRunAI();
  }

  function syncEliminationsToClocks() {
    CHESS_CONST.PLAYERS.forEach(p => {
      if (!game.engine.isActive(p)) game.clocks.freeze(p);
    });
  }

  function maybeRunAI() {
    if (!game || game.engine.status !== 'active' || game.paused) return;
    const cp = game.engine.currentPlayer();
    const ai = game.ais[cp];
    if (!ai) { updateBoardInteractivity(); return; }
    updateBoardInteractivity();
    const level = AI_LEVELS.find(l => l.id === game.config.aiLevel) || AI_LEVELS[2];
    setTimeout(() => {
      if (!game || game.paused || game.engine.status !== 'active' || game.engine.currentPlayer() !== cp) return;
      const move = ai.chooseMove(game.engine, cp);
      if (move) playMove(move);
    }, level.thinkMs + Math.random() * 250);
  }

  function onClockTick(player, ms) {
    if (!game) return;
    const warnMs = (settings.timerWarningSec || 20) * 1000;
    if (ms > 0 && ms < warnMs && Math.floor(ms / 1000) !== game._lastWarnSec) {
      game._lastWarnSec = Math.floor(ms / 1000);
      sound.timerWarning();
    }
    updateClocksUI();
  }

  function onTimeout(player) {
    if (!game) return;
    game.engine.timeOut(player);
    syncEliminationsToClocks();
    game.clocks.setActive(game.engine.currentPlayer());
    renderAll();
    if (game.engine.status === 'finished') finishGame();
    else maybeRunAI();
  }

  function pushSnapshot() {
    const e = game.engine;
    game.snapshots.push(JSON.stringify({
      grid: e.grid, eliminated: [...e.eliminated], resigned: [...e.resigned], timedOut: [...e.timedOut],
      turnIndex: e.turnIndex, moveHistory: e.moveHistory, capturedPieces: e.capturedPieces,
      status: e.status, winner: e.winner, result: e.result, lastMove: e.lastMove,
    }));
  }

  function restoreSnapshot(json) {
    const s = JSON.parse(json);
    const e = game.engine;
    e.grid = s.grid; e.eliminated = new Set(s.eliminated); e.resigned = new Set(s.resigned);
    e.timedOut = new Set(s.timedOut); e.turnIndex = s.turnIndex; e.moveHistory = s.moveHistory;
    e.capturedPieces = s.capturedPieces; e.status = s.status; e.winner = s.winner;
    e.result = s.result; e.lastMove = s.lastMove;
  }

  // --- Controls ---

  document.getElementById('ctrl-new').addEventListener('click', () => {
    if (confirmDialog('Start a new game? The current game will be lost.')) navigate('setup');
  });

  document.getElementById('ctrl-pause').addEventListener('click', () => togglePause());
  document.getElementById('resume-btn').addEventListener('click', () => togglePause());

  function togglePause() {
    if (!game || game.engine.status !== 'active') return;
    game.paused = !game.paused;
    document.getElementById('pause-overlay').style.display = game.paused ? 'flex' : 'none';
    if (game.paused) game.clocks.pause(); else game.clocks.resume();
    updateBoardInteractivity();
    if (!game.paused) maybeRunAI();
  }

  document.getElementById('ctrl-flip').addEventListener('click', () => {
    if (!game) return;
    const order = CHESS_CONST.PLAYERS;
    const idx = order.indexOf(game.board.orientation);
    const next = order[(idx + 1) % order.length];
    game.board.setOrientation(next);
    applyPanelOrientation(next);
    ArenaFit.recalc();
  });

  document.getElementById('ctrl-sound').addEventListener('click', (e) => {
    settings = Storage.saveSettings({ sound: !settings.sound });
    sound.setEnabled(settings.sound);
    e.target.textContent = settings.sound ? '🔊' : '🔇';
  });

  document.getElementById('ctrl-undo').addEventListener('click', () => {
    if (!game || game.engine.status !== 'active') return;
    const humanCount = CHESS_CONST.PLAYERS.filter(c => game.config.seats[c].type === 'human').length;
    if (humanCount < 2) { showToast('Undo is available in local multi-human seats.'); return; }
    if (game.snapshots.length < 2) { showToast('Nothing to undo.'); return; }
    game.snapshots.pop();
    restoreSnapshot(game.snapshots[game.snapshots.length - 1]);
    syncEliminationsToClocks();
    game.clocks.setActive(game.engine.currentPlayer());
    renderAll();
  });

  document.getElementById('ctrl-resign').addEventListener('click', () => {
    if (!game || game.engine.status !== 'active') return;
    const cp = game.engine.currentPlayer();
    if (!confirmDialog(`${game.config.names[cp]} (${CHESS_CONST.PLAYER_META[cp].label}) resigns -- are you sure?`)) return;
    game.engine.resign(cp);
    syncEliminationsToClocks();
    game.clocks.setActive(game.engine.currentPlayer());
    renderAll();
    if (game.engine.status === 'finished') finishGame(); else maybeRunAI();
  });

  document.getElementById('ctrl-draw').addEventListener('click', () => {
    if (!game || game.engine.status !== 'active') return;
    const active = game.engine.activePlayers();
    const names = active.map(p => game.config.names[p]).join(', ');
    if (confirmDialog(`Offer a draw? All remaining players (${names}) must agree.`)) {
      game.engine.forceDraw('agreement');
      game.clocks.pause();
      renderAll();
      finishGame();
    }
  });

  document.getElementById('ctrl-invite').addEventListener('click', () => openInviteModal());

  document.getElementById('history-toggle').addEventListener('click', () => {
    const panel = document.getElementById('history-panel');
    panel.classList.toggle('expanded');
  });
  document.getElementById('history-panel').addEventListener('transitionend', () => ArenaFit.recalc());

  // --- Rendering ---

  function renderAll() {
    updateBoardInteractivity();
    game.board.render();
    renderPanels();
    applyPanelOrientation(game.board.orientation);
    renderHistoryPanel();
    updateClocksUI();
  }

  const PIECE_GLYPH_SMALL = { K: '♚', Q: '♛', R: '♜', B: '♝', N: '♞', P: '♟' };

  function renderPanels() {
    const e = game.engine;
    const cur = e.status === 'active' ? e.currentPlayer() : null;
    CHESS_CONST.PLAYERS.forEach(p => {
      const el = document.getElementById('panel-' + p);
      const meta = CHESS_CONST.PLAYER_META[p];
      const isAI = game.config.seats[p].type === 'ai';
      const eliminated = !e.isActive(p);
      const timedOut = e.timedOut.has(p);
      let statusText = '';
      if (eliminated) {
        if (e.eliminated.has(p)) statusText = 'Eliminated';
        else if (e.resigned.has(p)) statusText = 'Resigned';
        else if (timedOut) statusText = 'TIME OUT';
      } else if (e.isInCheck(p)) {
        statusText = 'Check!';
      } else if (cur === p) {
        statusText = isAI ? 'Thinking…' : 'To move';
      }

      const caps = e.capturedPieces[p] || [];
      const capIcons = caps.map(entry => {
        const [type, owner] = entry.split(':');
        return `<span class="cap-icon player-${owner}">${PIECE_GLYPH_SMALL[type]}</span>`;
      }).join('');

      const msLeft = game.clocks.msLeft(p);
      const clockClasses = ['panel-clock'];
      if (cur === p && !eliminated) clockClasses.push('clock-active');
      if (!eliminated && msLeft < (settings.timerWarningSec || 20) * 1000) clockClasses.push('low-time');
      if (!eliminated && msLeft < 10000) clockClasses.push('critical-time');

      el.className = 'panel p-' + p + (cur === p ? ' active-turn' : '') + (eliminated ? ' eliminated' : '');
      el.innerHTML = `
        <div class="panel-identity">
          <span class="panel-swatch" style="background:${meta.hex}"></span>
          <span class="panel-name">${escapeHtml(game.config.names[p])}${isAI ? ' 🤖' : ''}</span>
        </div>
        <div class="${clockClasses.join(' ')}" id="clock-${p}">${timedOut ? 'TIME OUT' : ChessClocks.format(msLeft)}</div>
        <div class="panel-status ${e.isInCheck(p) ? 'status-check' : ''}">${statusText}</div>
        <div class="panel-captured">${capIcons}</div>
      `;
    });
  }

  function updateClocksUI() {
    CHESS_CONST.PLAYERS.forEach(p => {
      const el = document.getElementById('clock-' + p);
      if (!el) return;
      const active = game.engine.isActive(p);
      const timedOut = game.engine.timedOut.has(p);
      const msLeft = game.clocks.msLeft(p);
      el.textContent = timedOut ? 'TIME OUT' : ChessClocks.format(msLeft);
      el.classList.toggle('low-time', active && msLeft < (settings.timerWarningSec || 20) * 1000);
      el.classList.toggle('critical-time', active && msLeft < 10000);
      el.classList.toggle('clock-active', active && game.engine.currentPlayer() === p && game.engine.status === 'active');
    });
  }

  const PIECE_NAME = { K: 'K', Q: 'Q', R: 'R', B: 'B', N: 'N', P: '' };

  function squareLabel(r, c) {
    const file = String.fromCharCode('a'.charCodeAt(0) + c);
    const rank = 14 - r;
    return `${file}${rank}`;
  }

  function renderHistoryPanel() {
    const host = document.getElementById('move-history');
    const rows = game.engine.moveHistory.map(m => {
      const desc = `${PIECE_NAME[m.piece]}${m.capture ? 'x' : ''}${squareLabel(m.to[0], m.to[1])}${m.promoted ? '=Q' : ''}`;
      return `<div class="move-row">
        <span class="mv-num">${m.moveNumber}.</span>
        <span class="mv-player mv-${m.player}">${CHESS_CONST.PLAYER_META[m.player].label}</span>
        <span class="mv-desc">${desc}</span>
      </div>`;
    });
    host.innerHTML = rows.join('') || '<p class="hint">No moves yet.</p>';
    host.scrollTop = host.scrollHeight;
  }

  function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }
  function escapeAttr(str) { return escapeHtml(str).replace(/"/g, '&quot;'); }

  // --- End of game ---

  function finishGame() {
    game.clocks.pause();
    updateBoardInteractivity();
    const e = game.engine;
    const durationMin = Math.round((Date.now() - game.startedAt) / 60000);

    let title, detail, icon;
    if (e.result.type === 'draw') {
      title = 'Draw'; icon = '🤝';
      detail = e.result.reason === 'agreement' ? 'The remaining players agreed to a draw.' : 'All remaining players had no legal moves.';
    } else {
      const winnerName = game.config.names[e.winner];
      title = `${CHESS_CONST.PLAYER_META[e.winner].label.toUpperCase()} WINS`;
      icon = '🏆';
      const reasonText = {
        'checkmate': 'by checkmate', 'king-captured': 'by capturing the king',
        'timeout': 'on time', 'resignation': 'by resignation',
      }[e.result.reason] || '';
      detail = `${winnerName} wins ${reasonText}.`;
    }

    document.getElementById('result-icon').textContent = icon;
    document.getElementById('result-title').textContent = title;
    document.getElementById('result-detail').textContent = detail;
    document.getElementById('result-stats').innerHTML = `
      <div>Moves played<br><strong>${e.moveHistory.length}</strong></div>
      <div>Duration<br><strong>${durationMin} min</strong></div>
      <div>Time control<br><strong>${game.config.timeControlLabel}</strong></div>
      <div>Mode<br><strong>${escapeHtml(game.config.modeLabel)}</strong></div>
    `;
    document.getElementById('result-overlay').style.display = 'flex';

    let resultLabel = title;
    const humanSeats = CHESS_CONST.PLAYERS.filter(c => game.config.seats[c].type === 'human');
    if (humanSeats.length === 1) {
      const human = humanSeats[0];
      const didWin = e.winner === human;
      const didDraw = e.result.type === 'draw';
      Storage.recordResult({ didWin, didDraw });
      resultLabel = didDraw ? 'Draw' : (didWin ? 'You won' : 'You lost');
    } else if (humanSeats.length > 1) {
      resultLabel = e.result.type === 'draw' ? 'Draw' : `${game.config.names[e.winner]} won`;
    }

    Storage.addHistoryEntry({
      id: 'g' + Date.now(),
      date: Date.now(),
      modeLabel: game.config.modeLabel,
      names: game.config.names,
      winner: e.winner,
      resultType: e.result.type,
      resultReason: e.result.reason,
      resultLabel,
      moves: e.moveHistory.length,
      durationMin,
      timeControl: game.config.timeControlLabel,
    });
  }

  document.getElementById('result-rematch').addEventListener('click', () => {
    document.getElementById('result-overlay').style.display = 'none';
    navigate('setup');
  });

  // ---------------------------------------------------------------------
  // INVITE (room-code UI -- explicitly not real networking; see README)
  // ---------------------------------------------------------------------

  function generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
    return 'FK-' + code;
  }

  let currentRoomCode = null;

  function openInviteModal() {
    if (!currentRoomCode) currentRoomCode = generateRoomCode();
    document.getElementById('room-code').textContent = currentRoomCode;
    document.getElementById('invite-overlay').style.display = 'flex';
  }

  document.getElementById('hero-invite-btn').addEventListener('click', openInviteModal);
  document.getElementById('invite-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'invite-overlay') e.target.style.display = 'none';
  });
  document.getElementById('invite-copy').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(currentRoomCode);
      showToast('Room code copied.');
    } catch (e) {
      showToast('Could not copy -- code is ' + currentRoomCode);
    }
  });
  document.getElementById('invite-share').addEventListener('click', async () => {
    const text = `Join my Four Kings Arena match!\nRoom Code: ${currentRoomCode}`;
    if (navigator.share) {
      try { await navigator.share({ text }); } catch (e) { /* user cancelled */ }
    } else {
      try {
        await navigator.clipboard.writeText(text);
        showToast('Sharing isn\u2019t supported here -- invite text copied instead.');
      } catch (e) {
        showToast(text);
      }
    }
  });

  // ---------------------------------------------------------------------
  // HISTORY SCREEN
  // ---------------------------------------------------------------------

  function renderHistory() {
    const host = document.getElementById('history-list');
    const list = Storage.getHistory();
    if (!list.length) { host.innerHTML = '<p class="history-empty">No games played yet.</p>'; return; }
    host.innerHTML = list.map(g => `
      <div class="history-item" data-id="${g.id}">
        <div>
          <strong>${escapeHtml(g.modeLabel || 'Game')}</strong> -- ${escapeHtml(g.resultLabel)}
          <div class="meta">${new Date(g.date).toLocaleString()} · ${g.moves} moves · ${g.durationMin} min · ${escapeHtml(g.timeControl)}</div>
        </div>
        <div class="history-actions"><button data-del="${g.id}">Delete</button></div>
      </div>`).join('');
    host.querySelectorAll('[data-del]').forEach(btn => {
      btn.addEventListener('click', () => {
        Storage.deleteHistoryEntry(btn.dataset.del);
        renderHistory();
      });
    });
  }

  // ---------------------------------------------------------------------
  // STATS / PROFILE SCREEN
  // ---------------------------------------------------------------------

  function renderStats() {
    const profile = Storage.getProfile();
    document.getElementById('profile-avatar').textContent = profile.avatar || '♟';
    document.getElementById('profile-name').value = profile.name;
    document.getElementById('profile-rating').textContent = profile.rating;
    document.getElementById('profile-category').textContent = ratingCategory(profile.rating);

    const winRate = profile.gamesPlayed ? Math.round((profile.wins / profile.gamesPlayed) * 100) : 0;
    const cards = [
      { value: profile.gamesPlayed, label: 'Games played' },
      { value: profile.wins, label: 'Wins' },
      { value: profile.losses, label: 'Losses' },
      { value: profile.draws, label: 'Draws' },
      { value: winRate + '%', label: 'Win rate' },
      { value: profile.bestRating, label: 'Best rating' },
    ];
    document.getElementById('stats-grid').innerHTML = cards.map(c =>
      `<div class="stat-card"><div class="value">${c.value}</div><div class="label">${c.label}</div></div>`
    ).join('');

    drawResultsChart(profile);
  }

  function drawResultsChart(profile) {
    const svg = document.getElementById('stats-chart');
    const data = [
      { label: 'Wins', v: profile.wins, color: 'var(--success)' },
      { label: 'Losses', v: profile.losses, color: 'var(--danger)' },
      { label: 'Draws', v: profile.draws, color: 'var(--ink-2)' },
    ];
    const max = Math.max(1, ...data.map(d => d.v));
    const barW = 60, gap = 30, baseY = 100;
    let svgContent = '';
    data.forEach((d, i) => {
      const h = (d.v / max) * 80;
      const x = 20 + i * (barW + gap);
      svgContent += `<rect x="${x}" y="${baseY - h}" width="${barW}" height="${h}" rx="4" fill="${d.color}"></rect>`;
      svgContent += `<text x="${x + barW / 2}" y="${baseY + 16}" text-anchor="middle" font-size="11" fill="var(--ink-2)">${d.label}</text>`;
      svgContent += `<text x="${x + barW / 2}" y="${baseY - h - 6}" text-anchor="middle" font-size="12" fill="var(--ink-0)">${d.v}</text>`;
    });
    svg.innerHTML = svgContent;
  }

  document.getElementById('profile-name').addEventListener('change', (e) => {
    Storage.saveProfile({ name: e.target.value.trim() || 'Player' });
  });

  // ---------------------------------------------------------------------
  // SETTINGS SCREEN
  // ---------------------------------------------------------------------

  function renderSettingsScreen() {
    document.getElementById('set-theme').value = settings.theme;
    document.getElementById('set-board-theme').value = settings.boardTheme;
    document.getElementById('set-piece-style').value = settings.pieceStyle;
    document.getElementById('set-sound').checked = settings.sound;
    document.getElementById('set-animations').checked = settings.animations;
    document.getElementById('set-legal').checked = settings.showLegalMoves;
    document.getElementById('set-coords').checked = settings.showCoordinates;
    document.getElementById('set-confirm').checked = settings.moveConfirmation;
    document.getElementById('set-warning').value = String(settings.timerWarningSec);
  }

  function bindSetting(id, key, isCheckbox) {
    document.getElementById(id).addEventListener('change', (e) => {
      const value = isCheckbox ? e.target.checked : e.target.value;
      settings = Storage.saveSettings({ [key]: isCheckbox ? value : (isNaN(Number(value)) ? value : Number(value)) });
      if (key === 'theme') applyTheme();
      if (key === 'sound') sound.setEnabled(settings.sound);
    });
  }
  bindSetting('set-theme', 'theme', false);
  bindSetting('set-board-theme', 'boardTheme', false);
  bindSetting('set-piece-style', 'pieceStyle', false);
  bindSetting('set-sound', 'sound', true);
  bindSetting('set-animations', 'animations', true);
  bindSetting('set-legal', 'showLegalMoves', true);
  bindSetting('set-coords', 'showCoordinates', true);
  bindSetting('set-confirm', 'moveConfirmation', true);
  bindSetting('set-warning', 'timerWarningSec', false);

  // ---------------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------------

  applyTheme();
  sound.setEnabled(settings.sound);
  applyPreset('1v3');
  renderHome();

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('service-worker.js').catch(() => {});
    });
  }
})();
