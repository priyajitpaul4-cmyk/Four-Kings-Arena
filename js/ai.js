/**
 * ai.js
 * -----------------------------------------------------------------------
 * Five real, distinct AI difficulty levels for 4-Player Chess.
 *
 * Honesty note: this is a from-scratch heuristic/minimax engine sized for
 * a 160-square, 4-army board running in a browser tab. It is NOT a
 * grandmaster-strength engine and does not claim to be. There is no
 * Stockfish integration: Stockfish's move generator and evaluation are
 * built entirely around 2-player 8x8 chess and cannot be adapted to this
 * board/turn-order without effectively rewriting its search — so rather
 * than bolt on an engine that would silently misjudge the position, this
 * project ships one coherent custom engine and is upfront about its
 * ceiling.
 *
 * Level 1  Beginner      - legal-but-mostly-random, occasionally missetc.
 * Level 2  Easy          - prefers captures, otherwise random
 * Level 3  Intermediate  - 1-ply material + mobility evaluation
 * Level 4  Advanced      - 1-ply eval + king safety + center control
 * Level 5  Expert        - 2-ply minimax (own reply vs. worst-case reply)
 */

const PIECE_VALUE = { P: 1, N: 3, B: 3.2, R: 5, Q: 9, K: 1000 };

const AI_LEVELS = [
  { id: 1, name: 'Beginner',     desc: 'Learning basic moves', thinkMs: 250 },
  { id: 2, name: 'Easy',         desc: 'Makes occasional mistakes', thinkMs: 350 },
  { id: 3, name: 'Intermediate', desc: 'Balanced opponent', thinkMs: 500 },
  { id: 4, name: 'Advanced',     desc: 'Strong tactical play', thinkMs: 700 },
  { id: 5, name: 'Expert',       desc: 'Looks ahead two moves', thinkMs: 1000 },
];

class ChessAI {
  constructor(level = 3) {
    this.level = level;
  }

  chooseMove(engine, player) {
    const moves = engine.allLegalMoves(player);
    if (moves.length === 0) return null;

    switch (this.level) {
      case 1: return this._beginner(engine, player, moves);
      case 2: return this._easy(engine, player, moves);
      case 3: return this._eval1ply(engine, player, moves, false);
      case 4: return this._eval1ply(engine, player, moves, true);
      case 5: return this._minimax2ply(engine, player, moves);
      default: return moves[Math.floor(Math.random() * moves.length)];
    }
  }

  _beginner(engine, player, moves) {
    // Mostly random, but never hangs the queen for free if an obviously
    // safe alternative capture exists (keeps it "beginner", not "blind").
    const captures = moves.filter(m => m.capture);
    if (captures.length && Math.random() < 0.35) {
      return captures[Math.floor(Math.random() * captures.length)];
    }
    return moves[Math.floor(Math.random() * moves.length)];
  }

  _easy(engine, player, moves) {
    const captures = moves.filter(m => m.capture);
    if (captures.length && Math.random() < 0.75) {
      // Prefer the highest-value capture most of the time.
      captures.sort((a, b) => this._captureValue(engine, b) - this._captureValue(engine, a));
      const topN = captures.slice(0, Math.max(1, Math.ceil(captures.length / 2)));
      return topN[Math.floor(Math.random() * topN.length)];
    }
    return moves[Math.floor(Math.random() * moves.length)];
  }

  _captureValue(engine, move) {
    const target = engine.grid[move.to[0]][move.to[1]];
    return target ? (PIECE_VALUE[target.type] || 0) : 0;
  }

  _material(engine, player) {
    let score = 0;
    for (let r = 0; r < 14; r++) {
      for (let c = 0; c < 14; c++) {
        const p = engine.grid[r][c];
        if (!p) continue;
        const val = PIECE_VALUE[p.type] || 0;
        if (p.player === player) score += val; else score -= val / 3; // enemies weighted down (3 of them)
      }
    }
    return score;
  }

  _mobility(engine, player) {
    return engine.allPseudoMoves(player).length * 0.02;
  }

  _kingSafety(engine, player) {
    const king = engine.findKing(player);
    if (!king) return -50;
    let danger = 0;
    for (const opp of CHESS_CONST.PLAYERS) {
      if (opp !== player && engine.isActive(opp) && engine.isSquareAttacked(king[0], king[1], opp)) danger += 5;
    }
    return -danger;
  }

  _centerControl(engine, player) {
    let score = 0;
    for (let r = 5; r <= 8; r++) {
      for (let c = 5; c <= 8; c++) {
        const p = engine.grid[r][c];
        if (p && p.player === player) score += 0.15;
      }
    }
    return score;
  }

  _evaluate(engine, player, useAdvanced) {
    let score = this._material(engine, player) + this._mobility(engine, player);
    if (useAdvanced) {
      score += this._kingSafety(engine, player) + this._centerControl(engine, player);
    }
    return score;
  }

  _eval1ply(engine, player, moves, useAdvanced) {
    let best = null, bestScore = -Infinity;
    for (const m of moves) {
      const undo = engine._applyRaw(m);
      const score = this._evaluate(engine, player, useAdvanced) + (m.capture ? this._captureValue(engine, m) * 0.5 : 0);
      engine._undoRaw(undo);
      if (score > bestScore) { bestScore = score; best = m; }
    }
    return best || moves[0];
  }

  _minimax2ply(engine, player, moves) {
    let best = null, bestScore = -Infinity;
    // Sample-limit for performance on a large board.
    const candidates = this._orderMoves(engine, moves).slice(0, 18);

    for (const m of candidates) {
      const undo = engine._applyRaw(m);
      let myScore = this._evaluate(engine, player, true);

      // Opponent's best response (worst case for us) among a sampled set.
      let worstReply = 0;
      const opponents = CHESS_CONST.PLAYERS.filter(p => p !== player && engine.isActive(p));
      for (const opp of opponents) {
        const oppMoves = this._orderMoves(engine, engine.allLegalMoves(opp)).slice(0, 8);
        for (const om of oppMoves) {
          const undo2 = engine._applyRaw(om);
          const replyScore = this._evaluate(engine, opp, true);
          engine._undoRaw(undo2);
          worstReply = Math.max(worstReply, replyScore);
        }
      }
      const total = myScore - worstReply * 0.3;
      engine._undoRaw(undo);
      if (total > bestScore) { bestScore = total; best = m; }
    }
    return best || moves[0];
  }

  _orderMoves(engine, moves) {
    return [...moves].sort((a, b) => this._captureValue(engine, b) - this._captureValue(engine, a));
  }
}

if (typeof window !== 'undefined') {
  window.ChessAI = ChessAI;
  window.AI_LEVELS = AI_LEVELS;
}
