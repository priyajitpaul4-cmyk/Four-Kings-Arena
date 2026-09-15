/**
 * board.js
 * -----------------------------------------------------------------------
 * Renders the 14x14 cross-shaped board and handles tap-to-move,
 * drag-and-drop, selection highlighting, legal-move dots, capture rings,
 * and last-move highlighting.
 *
 * Promotion note: pawns auto-promote to Queen (documented simplification
 * — a full promotion-choice dialog is a natural follow-up feature).
 */

const PIECE_GLYPH = { K: '♚', Q: '♛', R: '♜', B: '♝', N: '♞', P: '♟' };

class BoardView {
  constructor(container, engine, opts) {
    this.container = container;
    this.engine = engine;
    this.opts = opts || {};
    this.selected = null;
    this.legalTargets = [];
    this.onMove = opts.onMove || (() => {});
    this.interactive = true;
    this.showLegal = opts.showLegal !== false;
    this.pieceStyle = opts.pieceStyle || 'modern';
    this.orientation = opts.orientation || 'red'; // which player's side faces the viewer (bottom)
    this._buildDom();
  }

  setInteractive(v) { this.interactive = v; }
  setOrientation(player) { this.orientation = player; this.render(); }
  setPieceStyle(style) { this.pieceStyle = style; this.render(); }

  _rotateForOrientation(r, c) {
    // Rotate the board so `orientation` player is always at the bottom.
    const steps = { red: 0, green: 1, yellow: 2, blue: 3 }[this.orientation] || 0;
    let rr = r, cc = c;
    for (let i = 0; i < steps; i++) {
      const nr = cc, nc = 13 - rr;
      rr = nr; cc = nc;
    }
    return [rr, cc];
  }

  _buildDom() {
    this.container.innerHTML = '';
    this.container.classList.add('fka-board');
    this.cells = {};
    for (let r = 0; r < 14; r++) {
      for (let c = 0; c < 14; c++) {
        if (!CHESS_CONST.isValidCell(r, c)) continue;
        const cell = document.createElement('div');
        cell.className = 'fka-cell';
        cell.dataset.r = r;
        cell.dataset.c = c;
        cell.style.gridRowStart = r + 1;
        cell.style.gridColumnStart = c + 1;
        const shade = (r + c) % 2 === 0 ? 'light' : 'dark';
        cell.classList.add('shade-' + shade);
        if (r === 0 && c >= 3 && c <= 10) cell.dataset.coordFile = String.fromCharCode(97 + c);
        if (c === 0 && r >= 3 && r <= 10) cell.dataset.coordRank = String(14 - r);
        cell.addEventListener('click', () => this._handleCellClick(r, c));
        this._makeDraggable(cell, r, c);
        this.container.appendChild(cell);
        this.cells[`${r},${c}`] = cell;
      }
    }
    this.render();
  }

  _makeDraggable(cell, r, c) {
    cell.draggable = true;
    cell.addEventListener('dragstart', (e) => {
      const piece = this.engine.grid[r][c];
      if (!this.interactive || !piece) { e.preventDefault(); return; }
      e.dataTransfer.setData('text/plain', `${r},${c}`);
      this._handleCellClick(r, c, true);
    });
    cell.addEventListener('dragover', (e) => e.preventDefault());
    cell.addEventListener('drop', (e) => {
      e.preventDefault();
      const data = e.dataTransfer.getData('text/plain');
      if (!data) return;
      const [fr, fc] = data.split(',').map(Number);
      this._tryMove(fr, fc, r, c);
    });
  }

  _handleCellClick(r, c, forceSelectOnly) {
    if (!this.interactive) return;
    const piece = this.engine.grid[r][c];
    const current = this.engine.currentPlayer();

    if (this.selected) {
      const [sr, sc] = this.selected;
      if (sr === r && sc === c) { this.selected = null; this.legalTargets = []; this.render(); return; }
      const isTarget = this.legalTargets.some(m => m.to[0] === r && m.to[1] === c);
      if (isTarget && !forceSelectOnly) {
        this._tryMove(sr, sc, r, c);
        return;
      }
    }

    if (piece && piece.player === current) {
      this.selected = [r, c];
      this.legalTargets = this.engine.legalMovesForPiece(r, c);
    } else {
      this.selected = null;
      this.legalTargets = [];
    }
    this.render();
  }

  _tryMove(fr, fc, tr, tc) {
    const moves = this.engine.legalMovesForPiece(fr, fc);
    const move = moves.find(m => m.to[0] === tr && m.to[1] === tc);
    if (!move) return;
    this.selected = null;
    this.legalTargets = [];
    this.onMove(move);
  }

  render() {
    const engine = this.engine;
    for (const key in this.cells) {
      const cell = this.cells[key];
      const r = Number(cell.dataset.r), c = Number(cell.dataset.c);
      cell.innerHTML = '';
      cell.classList.remove('selected', 'legal-move', 'legal-capture', 'last-from', 'last-to', 'in-check');

      const piece = engine.grid[r][c];
      if (piece) {
        const inert = engine.eliminated.has(piece.player);
        if (this.pieceStyle === 'modern' && typeof pieceSVG === 'function') {
          const hex = CHESS_CONST.PLAYER_META[piece.player].hex;
          const wrap = document.createElement('span');
          wrap.className = `fka-piece player-${piece.player}` + (inert ? ' inert' : '');
          wrap.innerHTML = pieceSVG(piece.type, hex, { inert });
          cell.appendChild(wrap);
        } else {
          const span = document.createElement('span');
          span.className = `fka-piece player-${piece.player}` + (inert ? ' inert' : '');
          span.textContent = PIECE_GLYPH[piece.type];
          cell.appendChild(span);
        }
      }

      if (this.selected && this.selected[0] === r && this.selected[1] === c) {
        cell.classList.add('selected');
      }
      if (this.showLegal && this.legalTargets.some(m => m.to[0] === r && m.to[1] === c)) {
        const isCap = this.legalTargets.find(m => m.to[0] === r && m.to[1] === c).capture;
        cell.classList.add(isCap ? 'legal-capture' : 'legal-move');
      }
      if (engine.lastMove) {
        if (engine.lastMove.from[0] === r && engine.lastMove.from[1] === c) cell.classList.add('last-from');
        if (engine.lastMove.to[0] === r && engine.lastMove.to[1] === c) cell.classList.add('last-to');
      }
      if (piece && piece.type === 'K' && engine.isActive(piece.player) && engine.isInCheck(piece.player)) {
        cell.classList.add('in-check');
      }
    }
  }
}

if (typeof window !== 'undefined') {
  window.BoardView = BoardView;
}
