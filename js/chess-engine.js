/**
 * chess-engine.js
 * -----------------------------------------------------------------------
 * A self-contained rules engine for 4-Player "Free-For-All" Chess on a
 * cross-shaped 14x14 board (the classic four-corners-removed layout).
 *
 * This engine is written from scratch for this project. It does not reuse
 * or wrap a 2-player chess library, because standard chess libraries
 * cannot represent the four-army board, the four-way turn order, or
 * elimination-based win conditions.
 *
 * DOCUMENTED RULE SIMPLIFICATIONS (see README.md "Rules" section):
 *  - En passant is not implemented.
 *  - Castling is not implemented (four-player variants rarely use it and
 *    the cross-shaped board makes the standard castling geometry ambiguous).
 *  - When a player is checkmated, their pieces stay on the board (they
 *    become inert / capturable) rather than being removed, and their king
 *    is treated as immune to further "check" bookkeeping. This matches
 *    the common "Free-For-All" ruleset used by most online 4-player
 *    chess implementations.
 *  - A player with no legal moves who is NOT in check simply has their
 *    turn skipped (rather than ending the whole game in a stalemate draw).
 *  - Draws are only reached by mutual agreement (see game.offerDraw) or
 *    when every remaining player is simultaneously stalemated.
 */

const BOARD_SIZE = 14;

const PLAYERS = ['red', 'blue', 'yellow', 'green'];

const PLAYER_META = {
  red:    { label: 'Red',    hex: '#d64545', order: 0 },
  blue:   { label: 'Blue',   hex: '#3b82c4', order: 1 },
  yellow: { label: 'Yellow', hex: '#d9a62e', order: 2 },
  green:  { label: 'Green',  hex: '#3fa65c', order: 3 },
};

// Forward direction (dr, dc) for pawns, per player, and the column/row
// bands each army occupies.
const PLAYER_CONFIG = {
  red:    { forward: [-1, 0], backRank: 13, pawnRank: 12, doubleRank: 10, promoteAt: 0,  homeAxis: 'row' },
  yellow: { forward: [1, 0],  backRank: 0,  pawnRank: 1,  doubleRank: 3,  promoteAt: 13, homeAxis: 'row' },
  blue:   { forward: [0, 1],  backRank: 0,  pawnRank: 1,  doubleRank: 3,  promoteAt: 13, homeAxis: 'col' },
  green:  { forward: [0, -1], backRank: 13, pawnRank: 12, doubleRank: 10, promoteAt: 0,  homeAxis: 'col' },
};
// Note: for blue/green, "backRank"/"pawnRank" etc. are column indices, not rows.

const BACK_RANK_ORDER = ['R', 'N', 'B', 'K', 'Q', 'B', 'N', 'R'];

function isValidCell(r, c) {
  if (r < 0 || r > 13 || c < 0 || c > 13) return false;
  const inMidRows = r >= 3 && r <= 10;
  const inMidCols = c >= 3 && c <= 10;
  // Cross shape: valid if in the middle row-band OR the middle col-band.
  return inMidRows || inMidCols;
}

class ChessEngine {
  constructor() {
    this.reset();
  }

  reset() {
    this.grid = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(null));
    this.eliminated = new Set();
    this.resigned = new Set();
    this.timedOut = new Set();
    this.turnOrder = [...PLAYERS];
    this.turnIndex = 0;
    this.moveHistory = [];
    this.capturedPieces = { red: [], blue: [], yellow: [], green: [] };
    this.status = 'active'; // active | finished
    this.winner = null;
    this.result = null; // { type, detail }
    this.lastMove = null;
    this._setupPieces();
  }

  _setupPieces() {
    // Top (yellow) rows 0-1, cols 3-10
    for (let i = 0; i < 8; i++) {
      const c = 3 + i;
      this.grid[0][c] = { type: BACK_RANK_ORDER[i], player: 'yellow', moved: false };
      this.grid[1][c] = { type: 'P', player: 'yellow', moved: false };
    }
    // Bottom (red) rows 12-13, cols 3-10
    for (let i = 0; i < 8; i++) {
      const c = 3 + i;
      this.grid[13][c] = { type: BACK_RANK_ORDER[i], player: 'red', moved: false };
      this.grid[12][c] = { type: 'P', player: 'red', moved: false };
    }
    // Left (blue) cols 0-1, rows 3-10
    for (let i = 0; i < 8; i++) {
      const r = 3 + i;
      this.grid[r][0] = { type: BACK_RANK_ORDER[i], player: 'blue', moved: false };
      this.grid[r][1] = { type: 'P', player: 'blue', moved: false };
    }
    // Right (green) cols 12-13, rows 3-10
    for (let i = 0; i < 8; i++) {
      const r = 3 + i;
      this.grid[r][13] = { type: BACK_RANK_ORDER[i], player: 'green', moved: false };
      this.grid[r][12] = { type: 'P', player: 'green', moved: false };
    }
  }

  cellAt(r, c) {
    if (!isValidCell(r, c)) return undefined;
    return this.grid[r][c];
  }

  isActive(player) {
    return !this.eliminated.has(player) && !this.resigned.has(player) && !this.timedOut.has(player);
  }

  activePlayers() {
    return PLAYERS.filter(p => this.isActive(p));
  }

  currentPlayer() {
    return this.turnOrder[this.turnIndex];
  }

  // ---------------------------------------------------------------------
  // Move generation
  // ---------------------------------------------------------------------

  _slide(r, c, player, dirs, out) {
    for (const [dr, dc] of dirs) {
      let nr = r + dr, nc = c + dc;
      while (isValidCell(nr, nc)) {
        const occ = this.grid[nr][nc];
        if (!occ) {
          out.push({ from: [r, c], to: [nr, nc] });
        } else {
          if (occ.player !== player) out.push({ from: [r, c], to: [nr, nc], capture: true });
          break;
        }
        nr += dr; nc += dc;
      }
    }
  }

  // Pseudo-legal moves: legal by piece geometry, ignoring self-check.
  pseudoMovesForPiece(r, c) {
    const piece = this.grid[r][c];
    if (!piece) return [];
    const { type, player } = piece;
    const moves = [];

    if (type === 'P') {
      const cfg = PLAYER_CONFIG[player];
      const [dr, dc] = cfg.forward;
      const oneR = r + dr, oneC = c + dc;
      if (isValidCell(oneR, oneC) && !this.grid[oneR][oneC]) {
        moves.push({ from: [r, c], to: [oneR, oneC] });
        const atStart = cfg.homeAxis === 'row' ? r === cfg.pawnRank : c === cfg.pawnRank;
        const twoR = r + dr * 2, twoC = c + dc * 2;
        if (atStart && isValidCell(twoR, twoC) && !this.grid[twoR][twoC]) {
          moves.push({ from: [r, c], to: [twoR, twoC], double: true });
        }
      }
      // Captures: perpendicular offsets relative to forward direction.
      const perp = dr === 0 ? [[1, dc], [-1, dc]] : [[dr, 1], [dr, -1]];
      for (const [cr, cc] of perp) {
        const nr = r + cr, nc = c + cc;
        if (isValidCell(nr, nc)) {
          const occ = this.grid[nr][nc];
          if (occ && occ.player !== player) {
            moves.push({ from: [r, c], to: [nr, nc], capture: true });
          }
        }
      }
    } else if (type === 'N') {
      const offsets = [[1,2],[2,1],[-1,2],[-2,1],[1,-2],[2,-1],[-1,-2],[-2,-1]];
      for (const [dr, dc] of offsets) {
        const nr = r + dr, nc = c + dc;
        if (!isValidCell(nr, nc)) continue;
        const occ = this.grid[nr][nc];
        if (!occ) moves.push({ from: [r, c], to: [nr, nc] });
        else if (occ.player !== player) moves.push({ from: [r, c], to: [nr, nc], capture: true });
      }
    } else if (type === 'B') {
      this._slide(r, c, player, [[1,1],[1,-1],[-1,1],[-1,-1]], moves);
    } else if (type === 'R') {
      this._slide(r, c, player, [[1,0],[-1,0],[0,1],[0,-1]], moves);
    } else if (type === 'Q') {
      this._slide(r, c, player, [[1,1],[1,-1],[-1,1],[-1,-1],[1,0],[-1,0],[0,1],[0,-1]], moves);
    } else if (type === 'K') {
      const offsets = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
      for (const [dr, dc] of offsets) {
        const nr = r + dr, nc = c + dc;
        if (!isValidCell(nr, nc)) continue;
        const occ = this.grid[nr][nc];
        if (!occ) moves.push({ from: [r, c], to: [nr, nc] });
        else if (occ.player !== player) moves.push({ from: [r, c], to: [nr, nc], capture: true });
      }
    }
    return moves;
  }

  allPseudoMoves(player) {
    const moves = [];
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        const p = this.grid[r][c];
        if (p && p.player === player) {
          moves.push(...this.pseudoMovesForPiece(r, c));
        }
      }
    }
    return moves;
  }

  isSquareAttacked(r, c, byPlayer) {
    // Only pieces of active (non-eliminated) players threaten squares.
    if (!this.isActive(byPlayer)) return false;
    const moves = this.allPseudoMoves(byPlayer);
    return moves.some(m => m.to[0] === r && m.to[1] === c);
  }

  findKing(player) {
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        const p = this.grid[r][c];
        if (p && p.player === player && p.type === 'K') return [r, c];
      }
    }
    return null;
  }

  isInCheck(player) {
    if (!this.isActive(player)) return false;
    const king = this.findKing(player);
    if (!king) return false;
    return PLAYERS.some(opp => opp !== player && this.isActive(opp) && this.isSquareAttacked(king[0], king[1], opp));
  }

  // Apply a move directly to the grid (no legality checks). Returns undo info.
  _applyRaw(move) {
    const [fr, fc] = move.from;
    const [tr, tc] = move.to;
    const piece = this.grid[fr][fc];
    const captured = this.grid[tr][tc];
    this.grid[tr][tc] = { ...piece, moved: true };
    this.grid[fr][fc] = null;
    return { move, piece, captured };
  }

  _undoRaw(undoInfo) {
    const [fr, fc] = undoInfo.move.from;
    const [tr, tc] = undoInfo.move.to;
    this.grid[fr][fc] = undoInfo.piece;
    this.grid[tr][tc] = undoInfo.captured || null;
  }

  legalMovesForPiece(r, c) {
    const piece = this.grid[r][c];
    if (!piece) return [];
    const pseudo = this.pseudoMovesForPiece(r, c);
    const legal = [];
    for (const m of pseudo) {
      const undo = this._applyRaw(m);
      if (!this.isInCheck(piece.player)) legal.push(m);
      this._undoRaw(undo);
    }
    return legal;
  }

  allLegalMoves(player) {
    const moves = [];
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        const p = this.grid[r][c];
        if (p && p.player === player) moves.push(...this.legalMovesForPiece(r, c));
      }
    }
    return moves;
  }

  // ---------------------------------------------------------------------
  // Playing a move
  // ---------------------------------------------------------------------

  makeMove(move) {
    const piece = this.grid[move.from[0]][move.from[1]];
    if (!piece) return null;
    const player = piece.player;
    const captured = this.grid[move.to[0]][move.to[1]];

    this._applyRaw(move);

    let promoted = false;
    const cfg = PLAYER_CONFIG[player];
    if (piece.type === 'P') {
      const coord = cfg.homeAxis === 'row' ? move.to[0] : move.to[1];
      if (coord === cfg.promoteAt) {
        this.grid[move.to[0]][move.to[1]] = { type: 'Q', player, moved: true };
        promoted = true;
      }
    }

    if (captured) {
      this.capturedPieces[player].push(captured.type + ':' + captured.player);
      // If the captured piece was an enemy king, that player is instantly eliminated.
      if (captured.type === 'K') {
        this._eliminate(captured.player, 'king-captured');
      }
    }

    const record = {
      player, piece: piece.type, from: move.from, to: move.to,
      capture: !!captured, capturedType: captured ? captured.type : null,
      capturedPlayer: captured ? captured.player : null,
      promoted, moveNumber: this.moveHistory.length + 1,
    };
    this.moveHistory.push(record);
    this.lastMove = { from: move.from, to: move.to };

    this._postMoveChecks(player);
    if (this.status === 'active') this._advanceTurn();
    return record;
  }

  _eliminate(player, reason) {
    if (this.eliminated.has(player)) return;
    this.eliminated.add(player);
    this._checkForWinner(reason);
  }

  _postMoveChecks(justMoved) {
    // Check every other active player for checkmate caused by this move.
    for (const opp of PLAYERS) {
      if (opp === justMoved || !this.isActive(opp)) continue;
      if (this.isInCheck(opp)) {
        const legal = this.allLegalMoves(opp);
        if (legal.length === 0) {
          this._eliminate(opp, 'checkmate');
        }
      }
    }
    this._checkForWinner('elimination');
  }

  _checkForWinner(reason) {
    const active = this.activePlayers();
    if (active.length <= 1 && this.status === 'active') {
      this.status = 'finished';
      this.winner = active[0] || null;
      this.result = { type: this.winner ? 'win' : 'draw', reason };
    }
  }

  _advanceTurn() {
    let attempts = 0;
    do {
      this.turnIndex = (this.turnIndex + 1) % this.turnOrder.length;
      attempts++;
    } while (!this.isActive(this.currentPlayer()) && attempts <= this.turnOrder.length);

    if (this.status !== 'active') return;

    // Handle stalemate-skip / all-stalemated draw.
    const cur = this.currentPlayer();
    if (this.isActive(cur)) {
      const legal = this.allLegalMoves(cur);
      if (legal.length === 0 && !this.isInCheck(cur)) {
        // Stalemate: skip this player's turn (documented simplification).
        const activeCount = this.activePlayers().length;
        let skips = 0;
        let p = cur;
        while (skips < activeCount) {
          const nextLegal = this.allLegalMoves(this.currentPlayer());
          if (nextLegal.length > 0 || this.isInCheck(this.currentPlayer())) break;
          this.turnIndex = (this.turnIndex + 1) % this.turnOrder.length;
          while (!this.isActive(this.currentPlayer())) {
            this.turnIndex = (this.turnIndex + 1) % this.turnOrder.length;
          }
          skips++;
        }
        if (skips >= activeCount) {
          this.status = 'finished';
          this.winner = null;
          this.result = { type: 'draw', reason: 'all-stalemated' };
        }
      }
    }
  }

  resign(player) {
    if (!this.isActive(player)) return;
    this.resigned.add(player);
    this._checkForWinner('resignation');
    if (this.status === 'active' && this.currentPlayer() === player) {
      this._advanceTurn();
    }
  }

  timeOut(player) {
    if (!this.isActive(player)) return;
    this.timedOut.add(player);
    this._checkForWinner('timeout');
    if (this.status === 'active' && this.currentPlayer() === player) {
      this._advanceTurn();
    }
  }

  forceDraw(reason) {
    this.status = 'finished';
    this.winner = null;
    this.result = { type: 'draw', reason: reason || 'agreement' };
  }
}

// Export for both classic <script> usage and potential module usage.
if (typeof window !== 'undefined') {
  window.ChessEngine = ChessEngine;
  window.CHESS_CONST = { BOARD_SIZE, PLAYERS, PLAYER_META, PLAYER_CONFIG, isValidCell };
}
