/* ai.js
 * Computer opponent: iterative-deepening alpha-beta search with captures-only quiescence,
 * piece-square evaluation, and per-bot "personality" (depth, time, noise, blunders, aggression).
 * Loads in the browser as window.ChessAI and in Node with require().
 */
(function (root) {
  "use strict";

  var E = typeof require === "function" && typeof module !== "undefined" && module.exports
    ? require("./engine.js") : root.ChessEngine;

  var MATE = 100000;
  var VALUE = { P: 100, N: 320, B: 330, R: 500, Q: 900, K: 0 };

  // Piece-square tables from White's point of view, row 0 = rank 8 (Michniewski's "simplified evaluation").
  var PST = {
    P: [0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 50, 50, 50, 50, 50, 50, 10, 10, 20, 30, 30, 20, 10, 10, 5, 5, 10, 25, 25, 10, 5, 5,
        0, 0, 0, 20, 20, 0, 0, 0, 5, -5, -10, 0, 0, -10, -5, 5, 5, 10, 10, -20, -20, 10, 10, 5, 0, 0, 0, 0, 0, 0, 0, 0],
    N: [-50, -40, -30, -30, -30, -30, -40, -50, -40, -20, 0, 0, 0, 0, -20, -40, -30, 0, 10, 15, 15, 10, 0, -30, -30, 5, 15, 20, 20, 15, 5, -30,
        -30, 0, 15, 20, 20, 15, 0, -30, -30, 5, 10, 15, 15, 10, 5, -30, -40, -20, 0, 5, 5, 0, -20, -40, -50, -40, -30, -30, -30, -30, -40, -50],
    B: [-20, -10, -10, -10, -10, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 10, 10, 5, 0, -10, -10, 5, 5, 10, 10, 5, 5, -10,
        -10, 0, 10, 10, 10, 10, 0, -10, -10, 10, 10, 10, 10, 10, 10, -10, -10, 5, 0, 0, 0, 0, 5, -10, -20, -10, -10, -10, -10, -10, -10, -20],
    R: [0, 0, 0, 0, 0, 0, 0, 0, 5, 10, 10, 10, 10, 10, 10, 5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5,
        -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, 0, 0, 0, 5, 5, 0, 0, 0],
    Q: [-20, -10, -10, -5, -5, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 5, 5, 5, 0, -10, -5, 0, 5, 5, 5, 5, 0, -5,
        0, 0, 5, 5, 5, 5, 0, -5, -10, 5, 5, 5, 5, 5, 0, -10, -10, 0, 5, 0, 0, 0, 0, -10, -20, -10, -10, -5, -5, -10, -10, -20],
    KM: [-30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30,
         -30, -40, -40, -50, -50, -40, -40, -30, -20, -30, -30, -40, -40, -30, -30, -20, -10, -20, -20, -20, -20, -20, -20, -10,
         20, 20, 0, 0, 0, 0, 20, 20, 20, 30, 10, 0, 0, 10, 30, 20],
    KE: [-50, -40, -30, -20, -20, -30, -40, -50, -30, -20, -10, 0, 0, -10, -20, -30, -30, -10, 20, 30, 30, 20, -10, -30,
         -30, -10, 30, 40, 40, 30, -10, -30, -30, -10, 30, 40, 40, 30, -10, -30, -30, -10, 20, 30, 30, 20, -10, -30,
         -30, -30, 0, 0, 0, 0, -30, -30, -50, -30, -30, -30, -30, -30, -30, -50]
  };

  /* Bots keep the names from the original game. depth = deepest search, timeMs = thinking budget,
   * noise = random centipawn wobble in move choice, blunder = chance of a random legal move,
   * aggro = bonus for checks and captures. */
  var BOTS = [
    { id: "lebron", name: "LeBron James Bot", title: "Rookie Power Player", level: "Beginner", depth: 1, timeMs: 300, noise: 150, blunder: 0.30, aggro: 0 },
    { id: "serena", name: "Serena Williams Bot", title: "Competitive Fighter", level: "Easy+", depth: 1, timeMs: 350, noise: 90, blunder: 0.20, aggro: 15 },
    { id: "presidential", name: "Presidential Strategist Bot", title: "Calm Decision Maker", level: "Easy+", depth: 2, timeMs: 400, noise: 80, blunder: 0.15, aggro: 0 },
    { id: "tal", name: "Mikhail Tal Bot", title: "The Attacker", level: "Medium", depth: 2, timeMs: 500, noise: 45, blunder: 0.09, aggro: 45 },
    { id: "judit", name: "Judit Polgar Bot", title: "Tactical Hunter", level: "Strong", depth: 3, timeMs: 600, noise: 35, blunder: 0.06, aggro: 30 },
    { id: "anand", name: "Viswanathan Anand Bot", title: "Speed Legend", level: "Strong", depth: 3, timeMs: 450, noise: 22, blunder: 0.04, aggro: 10 },
    { id: "gukesh", name: "Gukesh Bot", title: "Young Champion", level: "Very Strong", depth: 4, timeMs: 800, noise: 14, blunder: 0.025, aggro: 10 },
    { id: "hikaru", name: "Hikaru Nakamura Bot", title: "Blitz Monster", level: "Elite", depth: 4, timeMs: 500, noise: 10, blunder: 0.02, aggro: 10 },
    { id: "caruana", name: "Fabiano Caruana Bot", title: "Deep Calculator", level: "Elite", depth: 5, timeMs: 1000, noise: 6, blunder: 0.01, aggro: 0 },
    { id: "kasparov", name: "Garry Kasparov Bot", title: "Legend Boss", level: "Legend", depth: 6, timeMs: 1200, noise: 4, blunder: 0.005, aggro: 20 },
    { id: "magnus", name: "Magnus Carlsen Bot", title: "Final Boss", level: "World Boss", depth: 8, timeMs: 1500, noise: 0, blunder: 0, aggro: 0 }
  ];

  function getBot(id) {
    for (var i = 0; i < BOTS.length; i++) if (BOTS[i].id === id) return BOTS[i];
    return BOTS[0];
  }

  // Static evaluation in centipawns from the point of view of the side to move.
  function evaluate(pos) {
    var b = pos.board, score = 0, npm = 0, bishopsW = 0, bishopsB = 0, r, c, p, t, white, v, idx;
    for (r = 0; r < 8; r++) for (c = 0; c < 8; c++) {
      p = b[r][c];
      if (p === null) continue;
      t = p[1];
      if (t === "K") continue;
      white = p[0] === "w";
      idx = white ? r * 8 + c : (7 - r) * 8 + c;
      v = VALUE[t] + PST[t][idx];
      score += white ? v : -v;
      if (t !== "P") npm += VALUE[t];
      if (t === "B") { if (white) bishopsW++; else bishopsB++; }
    }
    if (bishopsW >= 2) score += 30;
    if (bishopsB >= 2) score -= 30;
    var table = npm <= 2600 ? PST.KE : PST.KM; // fewer pieces left: the king should come to the centre
    var wk = pos.kings.w, bk = pos.kings.b;
    score += table[wk[0] * 8 + wk[1]];
    score -= table[(7 - bk[0]) * 8 + bk[1]];
    return pos.turn === "w" ? score : -score;
  }

  function orderMoves(moves, first) {
    for (var i = 0; i < moves.length; i++) {
      var m = moves[i], s = 0;
      if (m.cap) s = 10000 + 10 * VALUE[m.cap[1]] - VALUE[m.piece[1]] / 10;
      if (m.promo) s += 9000 + VALUE[m.promo];
      if (first && m.fr === first.fr && m.fc === first.fc && m.tr === first.tr && m.tc === first.tc && m.promo === first.promo) s += 1e6;
      m.score = s;
    }
    moves.sort(function (a, b) { return b.score - a.score; });
  }

  /* Returns { move: {fr,fc,tr,tc,promo}, score, depth, nodes } for the side to move, or null if there are no moves. */
  function think(position, opts) {
    opts = opts || {};
    var pos = position.clone();
    var maxDepth = opts.depth || 2, deadline = Date.now() + (opts.timeMs || 500);
    var noise = opts.noise || 0, aggro = opts.aggro || 0, blunder = opts.blunder || 0;
    var nodes = 0, aborted = false;

    var rootMoves = pos.legalMoves();
    if (rootMoves.length === 0) return null;
    if (rootMoves.length === 1) return pack(rootMoves[0], 0, 0, 0);
    if (blunder && Math.random() < blunder) return pack(rootMoves[Math.floor(Math.random() * rootMoves.length)], 0, 0, 0);

    function tick() {
      if ((++nodes & 511) === 0 && Date.now() > deadline) aborted = true;
      return aborted;
    }

    function quiesce(alpha, beta, ply) {
      if (tick()) return 0;
      var stand = evaluate(pos);
      if (stand >= beta) return stand;
      if (stand > alpha) alpha = stand;
      if (ply > 20) return stand;
      var moves = pos.legalMoves(true);
      orderMoves(moves);
      for (var i = 0; i < moves.length; i++) {
        pos.make(moves[i]);
        var s = -quiesce(-beta, -alpha, ply + 1);
        pos.unmake();
        if (aborted) return 0;
        if (s >= beta) return s;
        if (s > alpha) alpha = s;
      }
      return alpha;
    }

    function negamax(depth, alpha, beta, ply) {
      if (tick()) return 0;
      var inChk = pos.inCheck(pos.turn);
      if (inChk && ply < 14) depth++;
      if (depth <= 0) return quiesce(alpha, beta, ply);
      if (pos.halfmove >= 100) return 0;
      var moves = pos.legalMoves();
      if (moves.length === 0) return inChk ? -MATE + ply : 0;
      orderMoves(moves);
      var best = -Infinity;
      for (var i = 0; i < moves.length; i++) {
        pos.make(moves[i]);
        var s = -negamax(depth - 1, -beta, -alpha, ply + 1);
        pos.unmake();
        if (aborted) return 0;
        if (s > best) best = s;
        if (s > alpha) alpha = s;
        if (alpha >= beta) break;
      }
      return best;
    }

    var chosen = null, chosenScore = 0, reached = 0, previousBest = null;
    var margin = noise * 2; // moves further than this below the best can never be picked

    for (var depth = 1; depth <= maxDepth; depth++) {
      orderMoves(rootMoves, previousBest);
      var scored = [], bestScore = -Infinity;
      for (var i = 0; i < rootMoves.length; i++) {
        var m = rootMoves[i];
        pos.make(m);
        var floor = bestScore === -Infinity ? -Infinity : bestScore - margin - 1;
        var s = -negamax(depth - 1, -Infinity, -floor, 1);
        pos.unmake();
        if (aborted) break;
        if (s > floor) {
          scored.push({ m: m, s: s });
          if (s > bestScore) bestScore = s;
        }
      }
      if (aborted) break;
      reached = depth;
      var pool = scored.filter(function (x) { return x.s >= bestScore - margin; });
      if (pool.length === 0) pool = scored;
      var pick = pool[0], pickVal = -Infinity;
      for (var j = 0; j < pool.length; j++) {
        var x = pool[j], v = x.s + Math.random() * noise;
        if (aggro && (x.m.cap || x.m.promo)) v += aggro / 2;
        pos.make(x.m);
        if (aggro && pos.inCheck(pos.turn)) v += aggro;
        pos.unmake();
        if (v > pickVal) { pickVal = v; pick = x; }
      }
      chosen = pick.m; chosenScore = pick.s;
      previousBest = pool.reduce(function (a, b) { return b.s > a.s ? b : a; }).m;
      if (bestScore > MATE - 200) break; // forced mate found, no need to look deeper
    }

    if (!chosen) chosen = rootMoves[0]; // ran out of time before finishing depth 1 (should not happen)
    return pack(chosen, chosenScore, reached, nodes);

    function pack(m, score, d, n) {
      return { move: { fr: m.fr, fc: m.fc, tr: m.tr, tc: m.tc, promo: m.promo }, score: score, depth: d, nodes: n };
    }
  }

  var api = { BOTS: BOTS, getBot: getBot, think: think, evaluate: evaluate, MATE: MATE };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.ChessAI = api;
})(typeof window !== "undefined" ? window : this);
